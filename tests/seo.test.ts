import assert from "node:assert/strict";
import { test } from "node:test";
import { homeStructuredData, jsonLd, publicIndexingEnabled, publicMetadata, siteOrigin } from "../src/lib/seo.ts";
import { seoGuides } from "../src/lib/seo-guides.ts";

test("public indexing is restricted to production, including protected Vercel previews", () => {
  assert.equal(publicIndexingEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }), true);
  assert.equal(publicIndexingEnabled({ NODE_ENV: "production" }), true);
  for (const VERCEL_ENV of ["preview", "development"]) assert.equal(publicIndexingEnabled({ NODE_ENV: "production", VERCEL_ENV }), false);
  assert.equal(publicIndexingEnabled({ NODE_ENV: "development" }), false);
});

test("public metadata has an unambiguous canonical URL and complete sharing metadata", () => {
  const metadata = publicMetadata("/guias", "Guias | RexNotas", "Orientações para preparar suas notas.");
  assert.deepEqual(metadata.alternates, { canonical: `${siteOrigin}/guias` });
  assert.equal(metadata.description, "Orientações para preparar suas notas.");
  assert.equal(metadata.openGraph?.url, `${siteOrigin}/guias`);
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.deepEqual(publicMetadata("/", "RexNotas", "Notas").alternates, { canonical: siteOrigin });
});

test("structured offers distinguish monthly and yearly billing and do not invent ratings", () => {
  const data = homeStructuredData();
  const application = data["@graph"].find(item => item["@type"] === "SoftwareApplication")!;
  const offers = application.offers!;
  assert.equal(offers.length, 8);
  assert.equal(offers.find(offer => offer.name === "Start · mensal")?.price, "14.90");
  assert.equal(offers.find(offer => offer.name === "Start · anual")?.price, "143.04");
  assert.equal(offers.find(offer => offer.name === "Top Afiliado · anual")?.price, "1343.04");
  assert.equal(offers.find(offer => offer.name === "Start · anual")?.priceSpecification.billingDuration, "P1Y");
  assert.equal("aggregateRating" in application, false);
  assert.equal("review" in application, false);
});

test("JSON-LD cannot close its script element and guide paths remain unique", () => {
  const serialized = jsonLd({ headline: "</script><script>alert(1)</script>" });
  assert.equal(serialized.includes("<"), false);
  assert.equal(JSON.parse(serialized).headline, "</script><script>alert(1)</script>");
  assert.equal(new Set(seoGuides.map(guide => guide.slug)).size, 3);
  for (const guide of seoGuides) {
    assert.match(guide.slug, /^[a-z0-9-]+$/);
    assert.equal(new Set(guide.sections.map(section => section.id)).size, guide.sections.length);
    assert.equal(guide.sources.every(source => new URL(source.href).protocol === "https:"), true);
  }
});
