import { SetMetadata } from "@nestjs/common";

/** Mark a route as publicly accessible (no JWT required). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Mark a route as requiring a specific role. */
export const ROLES_KEY = "roles";
export const Roles = (...roles: ("STUDENT" | "ADMIN")[]) => SetMetadata(ROLES_KEY, roles);

