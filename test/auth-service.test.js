const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "js/appwrite-config.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "js/auth-service.js"), "utf8");

function createAuthFixture({ membershipRoles = ["billets"], confirmed = true } = {}) {
  const calls = [];
  const account = {
    async createEmailSession(email) {
      calls.push(["createEmailSession", email]);
    },
    async deleteSession(sessionId) {
      calls.push(["deleteSession", sessionId]);
    },
    async get() {
      calls.push(["account.get"]);
      return { $id: "user-1", email: "agent@example.com", name: "Agent Test" };
    }
  };
  const teams = {
    async createMembership(...args) {
      calls.push(["createMembership", ...args]);
      return { $id: "membership-2" };
    },
    async listMemberships(teamId) {
      calls.push(["listMemberships", teamId]);
      return {
        memberships: [
          {
            $id: "membership-1",
            userId: "user-1",
            confirm: confirmed,
            roles: membershipRoles
          }
        ]
      };
    }
  };
  const window = {
    Appwrite: {
      Query: {
        equal(key, value) {
          return `${key}=${value}`;
        }
      }
    },
    CalypsoAppwrite: { account, teams },
    location: { href: "https://tely-hafia.github.io/billets-centre-loisirs/admin.html" }
  };
  const context = vm.createContext({ console, URL, window });

  vm.runInContext(configSource, context);
  vm.runInContext(authSource, context);

  return { auth: window.CalypsoAuth, calls };
}

test("restaure une session membre avec un rôle autorisé", async () => {
  const { auth } = createAuthFixture({ membershipRoles: ["billets"] });
  const context = await auth.restore(["billets"]);

  assert.equal(context.$id, "user-1");
  assert.deepEqual([...context.roles], ["billets"]);
  assert.equal(context.login, "agent@example.com");
});

test("refuse un espace lorsque le rôle requis manque", async () => {
  const { auth } = createAuthFixture({ membershipRoles: ["resto"] });

  await assert.rejects(
    () => auth.restore(["admin"]),
    (error) => error.code === "STAFF_ROLE_REQUIRED"
  );
});

test("une connexion non autorisée est immédiatement révoquée", async () => {
  const { auth, calls } = createAuthFixture({ membershipRoles: ["resto"] });

  await assert.rejects(() => auth.login("agent@example.com", "secret", ["admin"]));

  assert.ok(calls.some(([name]) => name === "createEmailSession"));
  assert.equal(
    calls.filter(([name, value]) => name === "deleteSession" && value === "current").length,
    2
  );
});

test("seul un administrateur peut envoyer une invitation", async () => {
  const { auth, calls } = createAuthFixture({ membershipRoles: ["admin"] });

  await auth.inviteStaff({
    email: "nouveau@example.com",
    name: "Nouvel Agent",
    roles: ["billets"]
  });

  const invitation = calls.find(([name]) => name === "createMembership");
  assert.equal(invitation[1], "calypco_staff");
  assert.deepEqual([...invitation[2]], ["billets"]);
  assert.equal(invitation[3], "nouveau@example.com");
  assert.match(invitation[6], /accept-invite\.html$/);
});
