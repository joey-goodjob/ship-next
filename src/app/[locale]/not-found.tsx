import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LocaleNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          404
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-normal">
          Page not found
        </h1>
        <p className="mt-3 text-base leading-7 tracking-normal text-zinc-400">
          This page does not exist or may have moved.
        </p>
      </div>
    </main>
  );
}
