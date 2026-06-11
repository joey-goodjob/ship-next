import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const headerSource = readFileSync("src/blocks/header.tsx", "utf8");
const navMatch = headerSource.match(/const navLinks = \[([\s\S]*?)\];/);

assert.ok(navMatch, "Header should define navLinks");

const navLinks = Array.from(
  navMatch[1].matchAll(/\{\s*href: "([^"]+)",\s*label: t\("([^"]+)"\)\s*\}/g),
).map(([, href, labelKey]) => ({ href, labelKey }));

assert.deepEqual(navLinks, [
  { href: "/create", labelKey: "nav.create" },
  { href: "/#create", labelKey: "nav.tools" },
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/#faq", labelKey: "nav.help" },
  { href: "/#faq", labelKey: "nav.contact" },
]);

for (const locale of ["en", "zh"]) {
  const landingMessages = JSON.parse(
    readFileSync(`src/config/locale/messages/${locale}/landing.json`, "utf8"),
  );

  assert.equal(typeof landingMessages.nav.tools, "string", `${locale} nav.tools should exist`);
  assert.equal(typeof landingMessages.nav.help, "string", `${locale} nav.help should exist`);
}
