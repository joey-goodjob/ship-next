import { Footer } from "@/blocks/footer";
import { Header } from "@/blocks/header";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 px-6 py-16 sm:py-20">
        <article className="prose prose-neutral mx-auto max-w-3xl dark:prose-invert">
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
