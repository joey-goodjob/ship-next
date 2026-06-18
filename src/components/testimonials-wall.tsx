import { Star } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type TestimonialWallItem = {
  id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  initials: string;
  avatarSrc?: string;
};

type TestimonialsWallProps = {
  title: string;
  description: string;
  items: TestimonialWallItem[];
  className?: string;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < rating ? "fill-brand-accent text-brand-accent" : "fill-white/15 text-white/15",
          )}
          aria-hidden={true}
        />
      ))}
    </div>
  );
}

function TestimonialCard({ item }: { item: TestimonialWallItem }) {
  return (
    <article className="rounded-xl bg-white/[0.055] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.26)]">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[oklch(0.82_0.16_82)] text-sm font-black text-[#141005] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]">
          {item.avatarSrc ? (
            <img
              src={item.avatarSrc}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            item.initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5 text-white">{item.name}</p>
          <p className="truncate text-xs leading-5 text-white/52">{item.role}</p>
        </div>
      </div>
      <div className="mt-4">
        <StarRating rating={item.rating} />
      </div>
      <p className="mt-4 line-clamp-4 text-sm leading-6 text-white/76">{item.quote}</p>
    </article>
  );
}

function ScrollColumn({
  direction,
  duration,
  items,
}: {
  direction: "up" | "down";
  duration: number;
  items: TestimonialWallItem[];
}) {
  const repeatedItems = [...items, ...items];

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className={cn(
          "testimonials-wall-column flex flex-col gap-4",
          direction === "up" ? "testimonials-wall-column-up" : "testimonials-wall-column-down",
        )}
        style={{ "--testimonials-duration": `${duration}s` } as CSSProperties}
      >
        {repeatedItems.map((item, index) => (
          <TestimonialCard key={`${item.id}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export function TestimonialsWall({ className, description, items, title }: TestimonialsWallProps) {
  const columns = Array.from({ length: 4 }, () => [] as TestimonialWallItem[]);

  items.forEach((item, index) => {
    columns[index % columns.length].push(item);
  });

  return (
    <section id="testimonials" className={cn("bg-[#06070b] px-5 py-[70px] text-white lg:py-[120px]", className)}>
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-sm font-semibold leading-5 text-brand-accent">Creator notes</p>
          <h2 className="mt-4 text-balance text-2xl font-bold leading-8 text-white lg:text-4xl lg:leading-10">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-[620px] text-pretty text-sm leading-6 text-white/62 lg:text-base lg:leading-7">
            {description}
          </p>
        </div>

        <div className="mt-12 lg:hidden">
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <div key={item.id} className="min-w-[82vw] snap-start sm:min-w-[22rem]">
                <TestimonialCard item={item} />
              </div>
            ))}
          </div>
        </div>

        <div className="testimonials-wall relative mt-14 hidden h-[520px] overflow-hidden lg:block">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#06070b] to-transparent" />
          <div className="grid h-full grid-cols-4 gap-4">
            {columns.map((columnItems, index) => (
              <ScrollColumn
                key={index}
                items={columnItems}
                direction={index % 2 === 0 ? "up" : "down"}
                duration={28 + index * 4}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#06070b] to-transparent" />
        </div>
      </div>
    </section>
  );
}
