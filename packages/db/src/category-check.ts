// Type-level guard, no runtime code: fails `npm run typecheck` if the Prisma `Category` enum and
// CATEGORY_IDS in @g12/config ever get out of sync (add/rename a category in both places).
import type { CategoryId } from "@g12/config";
import type { Category } from "./generated/prisma/client";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const categoriesMatchPrismaEnum: Equal<CategoryId, Category> = true;
