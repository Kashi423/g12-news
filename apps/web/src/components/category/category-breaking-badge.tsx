"use client";

import type { CategoryId } from "@g12/config";
import { BreakingBadge } from "../breaking/breaking-badge";
import { useBreaking } from "../breaking/breaking-provider";

/**
 * The BREAKING badge in a category's header, shown while that category has a breaking story. It
 * reads the same live list as the ticker (see BreakingProvider), so it appears when a story is
 * pushed and disappears when the story leaves the 6 hour window, with no reload.
 *
 * The wrapper is always rendered (an empty live region), so screen readers announce the badge
 * when it appears.
 */
export function CategoryBreakingBadge({ categoryId }: { categoryId: CategoryId }) {
  const { items } = useBreaking();
  const active = items.some((item) => item.category === categoryId);
  return (
    <span role="status" data-testid="category-breaking" data-active={active}>
      {active && (
        <BreakingBadge pulse className="!px-2 !py-1 !text-xs">
          Breaking
        </BreakingBadge>
      )}
    </span>
  );
}
