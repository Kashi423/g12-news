import { today } from "@/lib/home/dates";
import { SocialLinks } from "./social-links";

/** Slim navy strip at the very top: today's date (Pakistan time) on the left, social icons on the right. */
export function UtilityBar() {
  const date = today();
  return (
    <div className="bg-brand-900 text-[12px] text-white/85" data-testid="utility-bar">
      <div className="container flex h-8 items-center justify-between gap-3">
        <time dateTime={date.iso} className="truncate font-medium tracking-wide">
          <span className="sm:hidden">{date.short}</span>
          <span className="hidden sm:inline">{date.long}</span>
        </time>
        <SocialLinks className="h-7 w-7 text-white/80 hover:bg-white/15 hover:text-white" />
      </div>
    </div>
  );
}
