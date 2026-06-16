import { cn } from "@/lib/utils";

export type FeaturedCreatorVideo = {
  src: string;
  title?: string;
  description?: string;
};

type FeaturedCreatorsGalleryProps = {
  title: string;
  description: string;
  rows: FeaturedCreatorVideo[][];
};

type FeaturedCreatorsRowProps = {
  videos: FeaturedCreatorVideo[];
  direction: "left" | "right";
};

function FeaturedCreatorsCard({
  video,
  duplicate,
}: {
  video: FeaturedCreatorVideo;
  duplicate?: boolean;
}) {
  const hasCaption = Boolean(video.title || video.description);

  return (
    <article
      aria-hidden={duplicate}
      aria-label={video.title ? `${video.title}: ${video.description ?? ""}` : undefined}
      className="relative aspect-[9/16] w-[220px] shrink-0 overflow-hidden rounded-2xl bg-black md:w-[280px]"
    >
      <video
        src={video.src}
        className="h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        controls={false}
        disablePictureInPicture
      />

      {hasCaption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16 text-white">
          {video.title ? <h3 className="text-base font-semibold leading-6">{video.title}</h3> : null}
          {video.description ? (
            <p className="mt-1 text-sm font-normal leading-5 text-white/80">{video.description}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function FeaturedCreatorsRow({ videos, direction }: FeaturedCreatorsRowProps) {
  const repeatedVideos = [...videos, ...videos];

  return (
    <div className="relative overflow-hidden">
      <div
        className={cn(
          "featured-creators-track flex w-max items-center gap-2",
          direction === "left" ? "featured-creators-track-left" : "featured-creators-track-right",
        )}
      >
        {repeatedVideos.map((video, index) => (
          <FeaturedCreatorsCard
            key={`${direction}-${video.src}-${index}`}
            video={video}
            duplicate={index >= videos.length}
          />
        ))}
      </div>
    </div>
  );
}

export function FeaturedCreatorsGallery({ title, description, rows }: FeaturedCreatorsGalleryProps) {
  return (
    <section
      className="featured-creators-gallery relative isolate overflow-hidden bg-[#060816] py-12 text-white md:py-16"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(2, 8, 30, 0.7), rgba(8, 20, 70, 0.2)), url('/beatmv-showcase/bgdark.webp')",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_16%,rgba(0,136,255,0.42),transparent_34%),radial-gradient(circle_at_36%_0%,rgba(139,92,246,0.3),transparent_30%)]" />
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 px-4">
          <h2 className="bg-gradient-to-r from-purple-400 via-indigo-400 to-pink-400 bg-clip-text text-4xl font-semibold leading-10 text-transparent md:text-[62px] md:leading-[68px]">
            {title}
          </h2>
          <p className="mt-4 text-xl leading-7 text-white/70">{description}</p>
        </div>

        <div className="flex flex-col gap-2 overflow-hidden">
          {rows.map((videos, index) => (
            <FeaturedCreatorsRow
              key={index === 0 ? "top" : "bottom"}
              videos={videos}
              direction={index % 2 === 0 ? "left" : "right"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
