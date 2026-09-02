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

  function normalizeNamePart(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function buildStaffName(prenom, nom) {
    const normalizedPrenom = normalizeNamePart(prenom);
    const normalizedNom = normalizeNamePart(nom);

    if (!normalizedPrenom || !normalizedNom) {
      throw new Error("Le prénom et le nom de l’agent sont requis.");
    }

    return `${normalizedPrenom} ${normalizedNom}`;
  }

  function hasUsableStaffName(user) {
    const name = normalizeNamePart(user?.name);
    const email = normalizeNamePart(user?.email).toLowerCase();
    const userId = normalizeNamePart(user?.$id);

    return Boolean(
      name &&
      name !== userId &&
      name.toLowerCase() !== email
    );
  }

  async function getStaffContext(requiredRoles = [], authenticatedUser = null) {
    const user = authenticatedUser || await account.get();
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

    const profileComplete = hasUsableStaffName(user);
    const context = {
      $id: user.$id,
      user,
      membership,
      roles: normalizeRoles(membership.roles),
      login: user.email,
      nom: profileComplete ? normalizeNamePart(user.name) : "",
      profileComplete,
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
    let authenticatedUser = null;

    try {
      authenticatedUser = await account.get();
    } catch (error) {
      if (error?.code !== 401) throw error;
    }

    if (authenticatedUser) {
      const requestedEmail = String(email || "").trim().toLowerCase();
      const sessionEmail = String(authenticatedUser.email || "").trim().toLowerCase();

      if (requestedEmail === sessionEmail) {
        try {
          return await getStaffContext(requiredRoles, authenticatedUser);
        } catch (error) {
          await logout();
          throw error;
        }
      }

      await account.deleteSession("current");
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

  async function inviteStaff({ email, prenom, nom, roles }) {
    await getStaffContext([config.staffRoles.admin]);

    const normalizedRoles = normalizeRoles(roles);
    if (!email || normalizedRoles.length === 0) {
      throw new Error("Une adresse e-mail et au moins un rôle sont requis.");
    }

    const name = buildStaffName(prenom, nom);

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

  async function updateStaffName({ prenom, nom }) {
    await getStaffContext();
    const name = buildStaffName(prenom, nom);
    await account.updateName(name);
    return getStaffContext();
  }

  global.CalypsoAuth = Object.freeze({
    getStaffContext,
    hasAnyRole,
    inviteStaff,
    login,
    logout,
    normalizeRoles,
    restore,
    updateStaffName
  });
})(window);
