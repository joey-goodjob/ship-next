"use client";

import { useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeaturedCreatorMedia = {
  videoSrc: string;
  posterSrc: string;
  alt: string;
};

type FeaturedCreatorsGalleryProps = {
  title: string;
  description: string;
  exploreLabel: string;
  exploreHref: string;
  rows: FeaturedCreatorMedia[][];
};

type FeaturedCreatorsRowProps = {
  items: FeaturedCreatorMedia[];
  direction: "left" | "right";
};

function FeaturedCreatorsCard({ item }: { item: FeaturedCreatorMedia }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <article
      aria-label={item.alt}
      className="group relative mx-3 w-[min(78vw,520px)] shrink-0 overflow-hidden rounded-xl border border-gray-800 bg-[#18181c] transition-colors duration-300 hover:border-green-500 md:w-[520px]"
    >
      <div className="relative aspect-video bg-black">
        {isPlaying ? (
          <video
            src={item.videoSrc}
            poster={item.posterSrc}
            aria-label={item.alt}
            className="h-full w-full object-cover"
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          <button
            type="button"
            aria-label={`Play ${item.alt}`}
            onClick={() => setIsPlaying(true)}
            className="group/play relative block h-full w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          >
            <img
              src={item.posterSrc}
              alt={item.alt}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/play:scale-[1.03]"
              loading="lazy"
            />
            <span className="absolute inset-0 bg-black/18" aria-hidden={true} />
            <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/58 text-white shadow-lg backdrop-blur transition-transform group-hover/play:scale-105" aria-hidden={true}>
              <Play className="ml-1 size-7 fill-current" />
            </span>
          </button>
        )}
      </div>
    </article>
  );
}

function FeaturedCreatorsRow({ items, direction }: FeaturedCreatorsRowProps) {
  const repeatedItems = [...items, ...items];

  return (
    <div className="relative overflow-hidden">
      <div
        className={cn(
          "featured-creators-track flex w-max items-center",
          direction === "left" ? "featured-creators-track-left" : "featured-creators-track-right",
        )}
        style={{ animationDelay: direction === "left" ? "-4s" : "-20s" }}
      >
        {repeatedItems.map((item, index) => (
          <FeaturedCreatorsCard
            key={`${direction}-${item.videoSrc}-${index}`}
            item={item}
          />
        ))}
      </div>
    </div>
  );
}

export function FeaturedCreatorsGallery({
  title,
  description,
  exploreLabel,
  exploreHref,
  rows,
}: FeaturedCreatorsGalleryProps) {
  return (
    <section className="featured-creators-gallery overflow-hidden bg-black py-12 text-white md:py-16">
      <div className="mx-auto max-w-[1600px] px-4">
        <div className="mb-12 text-center">
          <h2 className="mx-auto max-w-6xl text-3xl font-bold leading-tight text-white md:text-5xl md:leading-none">
            {title}
          </h2>
          <p className="mt-3 text-base leading-7 text-gray-400 md:text-lg">{description}</p>
        </div>

        <div className="flex flex-col gap-6 overflow-hidden">
          {rows.map((items, index) => (
            <FeaturedCreatorsRow
              key={index === 0 ? "top" : "bottom"}
              items={items}
              direction={index % 2 === 0 ? "left" : "right"}
            />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <a
            href={exploreHref}
            className="inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 px-8 text-base font-semibold text-white shadow-lg transition-transform duration-200 hover:scale-105 hover:from-purple-600 hover:via-pink-600 hover:to-red-600"
          >
            {exploreLabel}
            <ArrowRight className="size-5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
