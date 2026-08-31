(function initCalypsoAuth(global) {
  "use strict";

  const config = global.CalypsoConfig;
  const { account, teams } = global.CalypsoAppwrite;
  const allowedRoles = Object.values(config.staffRoles);

  function normalizeRoles(roles) {
    return [...new Set((roles || []).filter((role) => allowedRoles.includes(role)))];
  }

  function hasAnyRole(context, roles) {
    const required = normalizeRoles(roles);
    return required.length === 0 || required.some((role) => context.roles.includes(role));
  }

  async function getStaffContext(requiredRoles = []) {
    const user = await account.get();
    const memberships = await teams.listMemberships(
      config.staffTeamId,
      [global.Appwrite.Query.equal("userId", user.$id)]
    );

    const membership = (memberships.memberships || []).find(
      (item) => item.userId === user.$id && item.confirm === true
    );

    if (!membership) {
      const error = new Error("Ce compte n'appartient pas à l'équipe Calypço.");
      error.code = "STAFF_MEMBERSHIP_REQUIRED";
      throw error;
    }

    const context = {
      $id: user.$id,
      user,
      membership,
      roles: normalizeRoles(membership.roles),
      login: user.email,
      nom: user.name || user.email,
      role: normalizeRoles(membership.roles).join(", ")
    };

    if (!hasAnyRole(context, requiredRoles)) {
      const error = new Error("Votre rôle ne permet pas d'accéder à cet espace.");
      error.code = "STAFF_ROLE_REQUIRED";
      throw error;
    }

    return context;
  }

  async function login(email, password, requiredRoles = []) {
    try {
      await account.deleteSession("current");
    } catch (_) {
      // Aucune session existante : rien à supprimer.
    }

    await account.createEmailSession(email, password);

    try {
      return await getStaffContext(requiredRoles);
    } catch (error) {
      await logout();
      throw error;
    }
  }

  async function restore(requiredRoles = []) {
    return getStaffContext(requiredRoles);
  }

  async function logout() {
    try {
      await account.deleteSession("current");
    } catch (error) {
      if (error?.code !== 401) throw error;
    }
  }

  async function inviteStaff({ email, name, roles }) {
    await getStaffContext([config.staffRoles.admin]);

    const normalizedRoles = normalizeRoles(roles);
    if (!email || normalizedRoles.length === 0) {
      throw new Error("Une adresse e-mail et au moins un rôle sont requis.");
    }

    const inviteUrl = new URL("accept-invite.html", global.location.href).toString();

    return teams.createMembership(
      config.staffTeamId,
      normalizedRoles,
      email,
      undefined,
      undefined,
      inviteUrl,
      name || email
    );
  }

  global.CalypsoAuth = Object.freeze({
    getStaffContext,
    hasAnyRole,
    inviteStaff,
    login,
    logout,
    normalizeRoles,
    restore
  });
})(window);
