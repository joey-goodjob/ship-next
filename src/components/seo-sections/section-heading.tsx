export function SectionHeading({
  title,
  description,
  align = "center",
}: {
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <h2 className="text-balance text-xl font-bold leading-[25px] text-brand-ink lg:text-4xl lg:leading-10">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
          {description}
        </p>
      ) : null}
    </div>
  );
}
