import { Header } from "@/blocks/header";
import { Hero } from "@/blocks/hero";
import { FeaturedCreators } from "@/blocks/featured-creators";
import { Features } from "@/blocks/features";
import { FAQ } from "@/blocks/faq";
import { CTA } from "@/blocks/cta";
import { Footer } from "@/blocks/footer";

/**
 * Default landing page — demo content. Rewrite this file (and the blocks in
 * src/blocks/) for your project. The primitives in src/components/ stay.
 * See /quick-start or /clone-website to automate the rewrite.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-background text-foreground">
      <Header />
      <Hero />
      <FeaturedCreators />
      <Features />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
