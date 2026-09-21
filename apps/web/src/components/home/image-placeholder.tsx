import Image from "next/image";
import { LOGO_PLACEHOLDER } from "@/lib/brand";

/**
 * Stand-in for a story with no image (the RSS feed had none, or it failed to load): the G12 News
 * logo on its own backdrop. Fills its (relatively positioned) parent.
 */
export function ImagePlaceholder() {
  return (
    <div aria-hidden="true" data-testid="image-placeholder" className="absolute inset-0 overflow-hidden bg-[#eeeeee]">
      <Image src={LOGO_PLACEHOLDER.src} alt="" fill unoptimized sizes="100vw" className="object-cover" />
    </div>
  );
}
