import type { SessionUser } from "@/lib/auth-guards";
import type { RbacContext, Scope } from "./types";

const FIXTURE_USER: SessionUser = {
  id: "fixture-user",
  name: "Fixture User",
  email: "fixture@fixture.test",
  role: "surveyor",
};

/**
 * Konteks RBAC buatan untuk unit test — tidak menyentuh DB dan tidak
 * bergantung pada seed. Dipakai untuk menguji engine, bukan data.
 */
export function fakeContext(
  grants: Record<string, Scope>,
  overrides: Partial<RbacContext> = {},
): RbacContext {
  return {
    user: FIXTURE_USER,
    permissions: new Map(Object.entries(grants)),
    clientId: null,
    ...overrides,
  };
}
