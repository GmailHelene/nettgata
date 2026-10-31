# Established global website and webshop platforms (state as of October 2026)

Scope: WordPress (self-hosted, WooCommerce, Elementor/Divi, WordPress.com), Shopify (incl. Plus), Wix (incl. Studio), Squarespace, Webflow, Framer, Adobe Commerce/Magento, BigCommerce (now "Commerce"), Hostinger, GoDaddy (incl. Airo), Square Online/Weebly, Jimdo, Ecwid, Shopware.
Research date: 2026-10-31. All prices are list prices excluding VAT unless stated. Data older than 2026 is labelled with its year.

Source-quality flags the report writer should know about:
- W3Techs (fetched directly, 14 Sep to 21 Oct 2026) and company investor releases (Shopify, Wix, GoDaddy, Commerce.com) are primary and reliable. Everything else is a secondary aggregator.
- ecommerce-times.com articles on Adobe Commerce (July/Aug 2026) contain claims that contradict Adobe's own lifecycle policy as quoted by other sources (see Q5). Treat them as unreliable.
- onlinestorenews.com figures (e.g. "Shopify GMV $312B, 3.1M merchants", "GMV $130B for 2025") contradict Shopify's own filings and are not used.
- "Number of stores" figures differ by up to 4x depending on tool (BuiltWith vs StoreLeads vs HTTP Archive vs W3Techs). Barn2 (2026-10-13) documents this and notes BuiltWith's own Shopify total has been reported as 1.81M, 2.45M, 4.08M and 752k at different times in a year. Never quote a single store count as fact.

---

## 1. CMS and e-commerce market share, trend 2023 to 2026, incl. Norway and Nordics

### Takeaway
WordPress is still dominant but has lost share fast in 2026 (about 43% of all websites in Jan 2026 to 39.6% in Oct 2026 on W3Techs), mostly to "no detectable CMS" (AI-built, headless, hand-coded), while Shopify, Wix and Squarespace gain share of the known-CMS market. In e-commerce, WooCommerce leads by store count, Shopify leads among larger/high-traffic sites and by GMV. Norway's .no domain is WordPress 54.8%, Squarespace 7.6%, Shopify 7.4% of known-CMS sites (W3Techs, 14 Sep 2026), i.e. WordPress is weaker and Squarespace/Shopify stronger than the global average.

### Cited Findings

All-websites CMS share (W3Techs, fetched directly):
- 21 Oct 2026 snapshot: no CMS 32.1%; WordPress 39.6% of all sites = 58.3% of known-CMS sites; Shopify 5.3% / 7.9%; Wix 4.2% / 6.2%; Squarespace 2.4% / 3.6%; Joomla 1.1% / 1.6%; Tilda 0.8% / 1.2%; Webflow 0.8% / 1.2%; Duda 0.7% / 1.1%; Drupal 0.6% / 0.9%; GoDaddy Website Builder 0.6% / 0.9%; Weebly 0.4% / 0.6%; Jimdo 0.3% / 0.4%; Lovable 0.2% / 0.4%; Hostinger Systems 0.2% / 0.4%; Framer 0.2% / 0.3%; IONOS MyWebsite 0.2% — [W3Techs CMS overview, Oct 2026](https://w3techs.com/technologies/overview/content_management)
- WordPress share of all websites on 1 Jan each year: 2021 39.5%; 2022 43.2%; 2023 43.1%; 2024 43.1%; 2025 43.6%; 2026 43.0%; 14-21 Oct 2026 39.6-40.0%. Share of known-CMS market: 2021 64.1%; 2022 65.2% (peak); 2023 63.7%; 2024 62.9%; 2025 62.0%; 2026 60.2%; Oct 2026 58.3-58.5% — [WPExposure, 2026-10-18](https://wpexposure.com/research/wordpress-statistics), [Search Engine Journal via wppoland, 2026-05-31/Oct update](https://wppoland.com/en/is-wordpress-dying-market-share-2026)
- Monthly 2026 slide (all-sites share): WordPress 42.7% (1 Mar) to 42.2% (1 May) to 41.5% (1 Jul) to 40.7% (1 Sep) to 40.2% (1 Oct); "no CMS" 28.6% (1 Dec 2025) to 31.5% (1 Oct 2026). Search Engine Journal counted six consecutive monthly declines Dec 2025 to late May 2026 — [wppoland, 2026-05-31 (updated Oct)](https://wppoland.com/en/is-wordpress-dying-market-share-2026); [The Register, 2026-06-03](https://theregister.com/saas/2026/06/03/automattics-cms-empire-shows-cracks-as-wordpress-share-falls/5250420)
- Crocoblock caveat: the jump in "no CMS" is the biggest single-year move in the dataset and "could be a sample change on W3Techs' side, so treat it as a flag, not a verdict" — [Crocoblock, 2026-09-24](https://crocoblock.com/blog/state-of-wordpress-page-builders-statistics)
- Known-CMS market share on 1 Jan, 2019 to Oct 2026 (W3Techs trend): Shopify 2.6% (2019), 5.7% (2023), 6.0% (2024), 6.7% (2025), 7.0% (2026), 7.9% (Oct 2026). Wix 1.8%, 3.6%, 3.8%, 4.6%, 5.8%, 6.2%. Webflow 0.2%, 0.9%, 1.0%, 1.1%, 1.2%, 1.2% — [Octoagency, 2026-10-25](https://octoagency.io/blog/webflow-statistics)
- WordPress share is lower at the top end: 48.3-48.4% of known-CMS sites in top 1M, 50.6-50.8% top 100k, 50.5-51% top 10k, 50-52% top 1k. Webflow is over-represented at the top (2.3% of known-CMS sites in top 10k, more than Wix and Framer combined there); Wix is nearly absent at the top (0.3% in top 10k) — [Octoagency, 2026-10-25](https://octoagency.io/blog/webflow-statistics), [WPExposure](https://wpexposure.com/research/wordpress-statistics)
- HTTP Archive mobile-crawl origins, Sep 2025 to Sep 2026: WordPress 3.16M to 2.71M (-14.2%); Wix 204k to 182k (-10.9%); Squarespace 101k to 93k (-8.4%); Webflow 64.9k to 60.7k (-6.5%); Framer 8.8k to 11.6k (+31.6%). HTTP Archive Web Almanac (July 2025) put WordPress at 64.3% of known-CMS mobile sites, 35.0-35.6% of all — [Octoagency, 2026-10-25](https://octoagency.io/blog/webflow-statistics), [StatisticsGlobal, 2026-10-21](https://statisticsglobal.org/wordpress-statistics)
- AI-site builders now show up in W3Techs: Lovable 0.2% of all sites (0.4% of CMS market) in Oct 2026; Framer 0.2% — [W3Techs](https://w3techs.com/technologies/overview/content_management)
- WordPress page builders: Elementor on 31.6% of detected WordPress sites (W3Techs); in an HTTP Archive Apr 2026 sample Elementor 32.67% of WP sites, block editor 20.6%, WPBakery 8.5%, Divi 5.7% (W3Techs shows Divi at 0.1% because it only detects the plugin, not the theme) — [Crocoblock, 2026-09-24](https://crocoblock.com/blog/state-of-wordpress-page-builders-statistics). Elementor free plugin has 10M+ active installs — [Sage Digital Agency, 2026-10-14](https://sage.agency/blog/elementor-vs-divi)

Nordic and Norway-specific (W3Techs segmentation by country TLD, "share of sites with known CMS"):
- .no (Norway), 14 Sep 2026: WordPress 54.8%, Squarespace 7.6%, Shopify 7.4% — [W3Techs .no](https://w3techs.com/technologies/segmentation/tld-no-/content_management)
- .se (Sweden), 19 Sep 2026: WordPress 65.4%, Shopify 7.6%, Wix 4.0% — [W3Techs .se](https://w3techs.com/technologies/segmentation/tld-se-/content_management)
- .dk (Denmark), 11 Oct 2026: WordPress 65.2%, Shopify 9.2%, team.blue Systems 3.6% — [W3Techs .dk](https://w3techs.com/technologies/segmentation/tld-dk-/content_management)
- .fi (Finland), 13 Sep 2026: WordPress 68.5%, Shopify 4.2%, Wix 3.6% — [W3Techs .fi](https://w3techs.com/technologies/segmentation/tld-fi-/content_management)
- A different data mirror (aguko, Oct 2026) reports .no as WordPress 75%, Wix 11%, Squarespace 4%, Joomla 1%, Drupal 1%. This is NOT W3Techs, methodology unknown, and conflicts with W3Techs' Norway figures above (Wix is not in W3Techs' .no top three) — [aguko.com, 2026-10-11](https://server1.aguko.com/cat/cms/no)
- Norway e-commerce platform share, May 2023 (BuiltWith via a Norwegian agency, older and unverified): Shopify 21%, Squarespace 20%, Wix Stores 16%, WooCommerce ~25% (separate line), Magento ~8%, BigCommerce ~5% (figures overlap and do not sum; treat as indicative only) — [webkonsepter.no, 2025-06-04](https://webkonsepter.no/starte-nettbutikk)
- Shopify has "over 8,500" registered Norwegian webshops (BuiltWith, cited for 2024) — [Inevo, 2025-11-21](https://inevo.no/blogg/shopify-netthandel)
- Norwegian-built SaaS shop alternatives named in Norwegian sources: 24Nettbutikk and Mystore, with Klarna Checkout, Vipps and Norwegian shipping built in, from about NOK 400/month — [Infoframe, 2026-06-25](https://infoframe.no/artikler/lage-nettbutikk), [Tennet, 2026](https://tennet.no/blogg/beste-nettbutikk-losning). No share data found for them.

E-commerce platform share:
- W3Techs e-commerce systems: WooCommerce 47.7-48.1%, Shopify 31.7-32.1% of sites using an identified e-commerce system; WooCommerce on 7.8-7.9% of ALL websites vs Shopify 5.4% — [Barn2, 2026-10-13](https://barn2.com/blog/shopify-vs-woocommerce-market-share), [WP Vetted, 2026-09-07](https://wpvetted.com/posts/is-wordpress-dying-2026), [WPExposure](https://wpexposure.com/research/wordpress-statistics)
- Barn2's 12-crawl average of HTTP Archive by site size: biggest 10k sites Shopify 0.49% vs WooCommerce 0.11% (4.4:1); biggest 100k 4.7:1; biggest 1M 1.9:1; whole 10M WooCommerce 1.3:1 ahead. Three years earlier the top-1M was level and top-10k was 1.3:1 for Shopify, so Shopify is pulling ahead upmarket. HTTP Archive Aug 2026: WooCommerce 6.39% of crawled sites vs Shopify 5.06% — [Barn2, 2026-10-13](https://barn2.com/blog/shopify-vs-woocommerce-market-share)
- BuiltWith live-site counts: Shopify 6.65M, WooCommerce 6.44M (but BuiltWith counts WooCommerce installs, not all with working checkout) — [Barn2](https://barn2.com/blog/shopify-vs-woocommerce-market-share)
- StoreLeads (Sep 2026): WooCommerce 4.05M live stores, -8% YoY in Q2 2026; Shopify 3.11M live stores, +11% YoY (quoted by Colorlib; StoreLeads page itself not fetched) — [Colorlib, 2026-10-01](https://colorlib.com/wp/woocommerce-statistics). Older StoreLeads (mid 2026, via webhostingservices.co): ~13.7M live stores worldwide; WooCommerce ~31% (~4.2M), Shopify ~21% (~2.9M), custom carts ~12%, Wix ~7% — [WebHostingServices, 2026-06-23](https://webhostingservices.co/research/ecommerce-platform-market-share)
- BuiltWith top 1M e-commerce sites (2025 figures, via Vendrux 2026-05-27): Shopify 28.8%, WooCommerce 18.2%, Magento/Adobe Commerce ~9%, PrestaShop ~3.5%, Salesforce Commerce Cloud ~2.7%. Top 10k: custom ~45%+, Shopify ~22%, SFCC ~8%, Magento ~7% — [Vendrux, 2026-05-27](https://wordpress.vendrux.com/ecommerce-platform-market-share-usa). Another source gives 83,907 BuiltWith Shopify Plus stores (44,387 US) and Plus = 6.74% of top-1M e-commerce sites — [Ecommercetrix, 2026-07-23](https://ecommercetrix.com/ecommerce-statistics/shopify-statistics)
- US e-commerce site share (StoreLeads/BuiltWith, via Vendrux): Shopify ~30%, Wix ~23%, Squarespace ~16%, WooCommerce ~14% — [Vendrux, 2026-05-27](https://wordpress.vendrux.com/ecommerce-platform-market-share-usa)
- Shopware: StoreLeads shows "just over 30,000" active Shopware stores mid 2026, down 6% YoY and about 20% below the 2023 peak, 67% in Germany, ~800 in Netherlands; Shopware's own marketing claims "over 100,000 shops" and "more than 11.5% of Germany's top 1,000 shops" — [Codemaker-S, 2026-08-09](https://codemaker-s.com/en/platform/shopware), [Qualimero, 2026-03-30](https://qualimero.com/en/blog/shopware-online-shop-2025-costs-setup-ai-consultation-guide)

### Inferences
- The WordPress decline is real in direction but its size is probably amplified by a rise in sites W3Techs cannot classify (AI-generated, headless, framework-built). Shopify/Wix/Squarespace gains are steady but modest (Shopify +1.2 pts of CMS market in about a year).
- For a Norwegian entrant, the structural opening is that Norway's WordPress share (54.8%) is below global (58.3%) and the SaaS builders (Squarespace 7.6%, Shopify 7.4%) are relatively strong, which suggests Norwegian SMEs are already comfortable with hosted SaaS, not only with WordPress agencies. Wix is not in the top three in .no.
- WooCommerce's lead is a long-tail count of small/dormant shops; Shopify's lead is in revenue-weighted segments. Positioning against "store count" is misleading.

### Gaps
- No usable BuiltWith or W3Techs Norway-specific e-commerce platform share for 2026 (BuiltWith trends pages are paywalled/not fetched; W3Techs ecommerce page fetch failed). The 2023 Norway e-commerce figure is old and from a secondary source.
- No Norwegian-market share figures found for Mystore, 24Nettbutikk or other local platforms.
- The 2023 to 2026 trend for Shopify, Wix, Squarespace is available only at 1 January snapshots plus Oct 2026; W3Techs Webflow/Framer all-sites figures not found beyond what is cited.

---

## 2. Revenue, subscribers, growth, churn/retention (investor-report data)

### Takeaway
Shopify is the growth outlier (Q2 2026 revenue +34%, GMV +32%, FCF margin 18%), driven by payments take rate and upmarket/B2B. Wix grows revenue about 15% with ARR $1.96B, 105% net revenue retention, but free cash flow fell sharply because of AI investment (Base44, Harmony). GoDaddy grows about 7% with >85% retention and is cannibalising its website-builder bookings to push Airo. BigCommerce/Commerce.com is flat (revenue +0.1%, NRR 95.8%). Squarespace has not reported since Q2 2024.

### Cited Findings

Shopify (primary: Q2 2026 results, 5 Aug 2026; FY2025 results 11 Feb 2026):
- Q2 2026: revenue $3,583M (+34%, +33% constant currency); GMV $115,567M (+32%); gross profit $1,708M (+31%); operating income $488M (+68%); FCF $654M (18% margin); MRR $221M (vs $185M); subscription solutions $802M (+22%), merchant solutions $2,781M (+37%) — [Shopify Q2 2026 release, 2026-08-05](https://finance.yahoo.com/markets/stocks/articles/shopify-delivers-big-30-growth-110000439.html), [Shopify IR PDF](https://shopifyinvestors.gcs-web.com/node/12751/pdf)
- Q3 2026 guidance: revenue growth low-thirties %; gross profit growth mid-to-high twenties %; FCF margin high-teens to low-twenties. Q3 report scheduled 3 Nov 2026 (not yet published at research date) — same release; [Drillr, 2026-10-14](https://drillr.ai/article/shop-shopify-q3-2026-earnings-preview-payments-gross-profit-lending)
- FY2025: revenue $11,556M (+30%), GMV $378.4B (+29%, after +24% in 2024, +20% in 2023, +12% in 2022); merchant solutions $8,804M (76%), subscription $2,752M (24%) — [Uncap, 2026-10-22](https://uncap.com/post/shopify-statistics)
- Q1 2026: GMV $100.7B (+35%), revenue $3,170M (+34%), FCF $476M (15%) — [Drillr, 2026-10-14](https://drillr.ai/article/shop-shopify-q3-2026-earnings-preview-payments-gross-profit-lending)
- Shopify Payments penetration 68% of GMV in Q2 2026 (64% a year earlier; 60% in Q1 2024); GPV $78.1B (+38%); Payments live in 40 countries; Europe penetration +350 bps YoY; Shop Pay GMV +53%; international GMV +37%; offline +32%; B2B GMV +76% in Q2 2026 (+96% in 2025) — [Yahoo Finance/Zacks, 2026-09-30](https://finance.yahoo.com/markets/stocks/articles/shopifys-merchant-solutions-growth-accelerates-131600831.html), [Uncap](https://uncap.com/post/shopify-statistics)
- Plus accounts for 34% of MRR; "the majority of GMV" comes from Plus and enterprise merchants (10-K 2025 quote); $25M+ GMV cohort is fastest-growing — [Drillr](https://drillr.ai/article/shop-shopify-q3-2026-earnings-preview-payments-gross-profit-lending), [Zacks, 2026-10-10](https://zacks.com/stock/news/2990881/shopify-plunges-13-in-a-month-buy-sell-or-hold-the-stock)
- Shopify does not disclose merchant count or churn; annual report says only "millions of merchants from more than 175 countries" — [Barn2](https://barn2.com/blog/shopify-vs-woocommerce-market-share). No churn/retention metric published.
- Shopify Capital: net loans and MCAs $2.18B at end Jun 2026; transaction and loan losses $141M in Q2 (vs $80M) — [Drillr](https://drillr.ai/article/shop-shopify-q3-2026-earnings-preview-payments-gross-profit-lending), [Shopify release](https://finance.yahoo.com/markets/stocks/articles/shopify-delivers-big-30-growth-110000439.html)
- Partner ecosystem: Shopify says app ecosystem earned developers $1.3B in 2025 and the partner ecosystem generated $6.86 per $1 of Shopify revenue (2025); 21,000+ apps; active app installs up nearly 20% YoY — [Shopify, 2026-07-28](https://shopify.com/news/a-world-with-more-builders), [Shopify, 2026-04-28](https://shopify.com/news/billion-dollar-ecosystem)

Wix (primary: Q2 2026 results, 4 Aug 2026; secondary on FY2025):
- Q2 2026: revenue $563.1M (+15%); bookings $569.1M (+12%); total ARR $1,962.5M (+15% vs $1,699.9M); Creative Subscriptions revenue $398.4M (+15%); Business Solutions $164.7M (+14%); transaction revenue $71.5M (+12%); FCF $52.6M vs $147.7M a year earlier (ex-acquisition costs $61.2M) — [Wix Q2 2026 release, 2026-08-04](https://globenewswire.com/news-release/2026/08/04/3338018/0/en/wix-reports-second-quarter-2026-results.html)
- H1 2026 revenue $1,104.2M vs $963.6M; FCF $127.6M vs $290.1M — same release.
- FY2026 guidance: revenue growth low-to-mid teens, bookings low teens (lagging revenue by several points) — [Motley Fool transcript, 2026-08-11](https://fool.com/earnings/call-transcripts/2026/08/11/wix-wix-q2-2026-earnings-call-transcript)
- Base44 (AI app builder, acquired 2025) near-zero non-GAAP gross margin entering 2026, targeted ~60% in H2 after launching own LLM "Base 1"; Wix Harmony (AI editor) launched Jan 2026 — [Wix Q2 2026 release](https://globenewswire.com/news-release/2026/08/04/3338018/0/en/wix-reports-second-quarter-2026-results.html), [WebChoiceDesk, 2026-09-26](https://webchoicedesk.com/en-us/wix-review)
- Registered users ~317M at 30 Jun 2026 incl. Base44; 304M+ at end 2025; 6.11M premium subscriptions at end 2025 incl. Base44 (down from 6.2M in prior year per one aggregator; about 2% of registered users pay); 83% of premium subscriptions on annual or multi-year plans (Wix 20-F as quoted); about 40% revenue outside North America; net revenue retention above 105% in 2025; Creative Subscriptions gross margin 80% (85% a year earlier), Business Solutions 33% — [Tech Glean, 2026-10-15](https://techglean.com/wix-statistics-2026-users-revenue-market-share), [Quartr, 2026-08-19](https://quartr.com/events/wix-com-ltd-wix-q2-2026_3YljuKHN), [Investing.com slides, 2026-08-04](https://ca.investing.com/news/company-news/wix-q2-2026-slides-ai-push-drives-15-revenue-growth-93CH-4774656). (Tech Glean is a secondary aggregator quoting Wix's FY2025 filings; verify against the 20-F before publishing the 6.11M figure.)

GoDaddy (primary: Q2 2026 results, 30 Jul 2026):
- Q2 2026 revenue $1,298.0M (+6.6%); Applications and Commerce (A&C) $514.8M (+11%, EBITDA margin 46.8%); Core Platform $783.2M (+3.9%); bookings $1,422M (+6%; A&C bookings +7%); normalized EBITDA $434M (33%); FCF $443M (TTM $1.73B); ARR $4.4B (+6%); total customers 20.5M (+22k in the quarter, +35k since Dec 2025); ARPU $250 (+9%); customer retention "above 85%"; more than 50% of customers hold 2+ paid products — [GoDaddy Q2 2026 release](https://aboutus.godaddy.net/newsroom/news-releases/press-release-details/2026/GoDaddy-Inc--Reports-Second-Quarter-2026-Financial-Results), [Yahoo/Zacks call highlights, 2026-07-31](https://finance.yahoo.com/markets/stocks/articles/godaddy-inc-gddy-q2-2026-050136279.html), [TradingView, 2026-07-30](https://tradingview.com/news/tradingview:5d7a5b8f2847a:0-godaddy-reports-q2-2026-revenue-1-30b-operating-income-342-5m-and-net-income-240-1m)
- Airo (agentic AI "operating system" for small business) annualized bookings run rate $50M, up from $10M one quarter earlier; >70% of customers who used Airo in 2026 hold 2+ products; monetized by subscription plus token usage; Airo being tested in the domain purchase path ("our largest funnel") — same sources.
- Management says traditional template website builders and do-it-for-you services are being de-emphasised as capabilities move into Airo; affected products were about 1 point of total bookings in Q2; A&C bookings expected to stay high-single-digit for the rest of 2026 with no timetable for Airo to offset it; DIFM tickets historically "a couple thousand dollars" now see narrower demand — [Yahoo call highlights, 2026-07-31](https://finance.yahoo.com/technology/articles/godaddy-q2-earnings-call-highlights-090405575.html)
- FY2026 revenue guidance $5.215-5.255B (~6%); Q3 guide $1.315-1.335B (~5%) — [Investing.com, 2026-07-30](https://investing.com/news/company-news/godaddy-q2-2026-slides-ai-push-drives-results-market-skeptical-93CH-4826485). Q3 results were due around early Nov 2026 (not yet public).

Squarespace (private since Oct 2024):
- Taken private by Permira for about $7.2B (completed Oct 2024). Last public numbers: 2023 revenue $1.012B (92% subscriptions); Q2 2024 annual run-rate ~$1.18B; 5.2M+ unique subscriptions (Q2 2024) — [Colorlib, 2026-10-01](https://colorlib.com/wp/squarespace-statistics), [StyleFactory, 2026-09-09](https://stylefactoryproductions.com/blog/squarespace-statistics). No 2025/2026 revenue, subscriber or churn data found.
- Squarespace Payments, Google Domains transfer (roughly 10M domains per one secondary blog) — [Christian Daniel Designs, 2026-04-10](https://christiandanieldesigns.com/blog/what-is-squarespace-and-why-do-so-many-businesses-use-it) (low-quality source; treat the 10M figure as unverified).

BigCommerce / Commerce.com (primary: Q2 2026, 6 Aug 2026):
- Renamed Commerce.com (Nasdaq CMRC). Q2 2026 revenue $84.5M (+0.1%); ARR $360.5M (+2%); subscription revenue $63.1M (-1%); GMV $8.8B (+14%); B2B GMV +17%; net revenue retention 95.8% (95.4% in Q1, 94.5% a year earlier); GAAP net income $1.1M; FY2026 revenue guidance cut to $336.5-344.5M, citing softness in B2C replatforming and a more concentrated partner strategy — [Commerce.com Q2 2026 release](https://globenewswire.com/news-release/2026/08/06/3340096/0/en/Commerce-Announces-Second-Quarter-2026-Financial-Results.html), [Yahoo/MarketBeat call highlights, 2026-08-06](https://finance.yahoo.com/markets/stocks/articles/bigcommerce-q2-earnings-call-highlights-130400567.html)

Webflow and Framer (private):
- Webflow: last disclosed $4B valuation and ~$100M ARR in March 2022 (Series C $120M, total funding $330M+); About page (Sep 2026) claims 3.5M users and $335M raised; G2 4.4/5 (995 reviews, Oct 2026); Trustpilot 1.4/5 (226 reviews). No 2025/26 revenue disclosed — [Devgraphiq, 2026-09-14](https://devgraphiq.com/webflow-statistics), [JustPricing, 2026-09-06](https://justpricing.com/webflow-pricing), [CheckThat.ai, 2026-06-25](https://checkthat.ai/brands/wix/alternatives)
- Framer: Series D $100M at $2B valuation (28 Aug 2025, Meritech and Atomico); ARR about $50M in 2025 (Framer spokesperson to TechCrunch), target $100M in 2026; 500k+ monthly active users (Aug 2025); June 2026 press release: 188,000 companies in 200 countries, 4M+ published sites, ~364M monthly visitors, $6.5M paid to marketplace creators in 2025 — [Devgraphiq, 2026-05-04 (updated)](https://devgraphiq.com/framer-statistics)

Hostinger (private, Lithuania):
- FY2025 revenue EUR 275.4M, +51% YoY; 4.6M-5M+ customers in 150+ countries; Horizons (vibe-coding) reached 1M users in its first year; on 18 Aug 2026 Horizons and Website Builder merged into "Hostinger AI Builder" — [Akta profile, 2026-10-19](https://akta.pro/company-profiles/0000iwu/hostinger), [Streamlinefeed, 2026-07-02](https://streamlinefeed.co.ke/news/hostinger-275-million-surge-ai-web-development-2026), [Vibecoding.app update, Sep 2026](https://vibecoding.app/blog/hostinger-horizons-review). (Secondary sources; no direct Hostinger filing fetched. The "Horizons 1M users" and revenue growth should be verified before use.)

Shopware, Jimdo, Ecwid, Square/Weebly, Automattic, Elementor:
- Shopware: claims EUR 12B annual merchant revenue (Q2 2026) and 2,900+ extensions (Shopware-marketing as quoted by Qualimero, a vendor blog) — [Qualimero, 2026-03-30](https://qualimero.com/en/blog/shopware-online-shop-2025-costs-setup-ai-consultation-guide). Shopware revenue/ARR not found.
- Jimdo: "over 32 million websites created" since 2007 (marketing figure) — [Softabase, 2026-03-25](https://softabase.com/software/website-builder/jimdo). No revenue/subscriber data found.
- Ecwid (Lightspeed): G2 4.7/5 (405 reviews); no revenue disclosure found — [TechnologyChecker, 2026-10-04](https://technologychecker.io/compare/wix-vs-weebly)
- Weebly/Square: Square is winding Weebly down in 67 countries (sites unpublished 27 Sep 2026, accounts closed 26 Dec 2026); US, Canada, UK, Australia, Ireland, NZ and major EU markets are NOT on the list. Weebly 0.4% of all websites — [Boykin Web Management, 2026-09-21](https://boykinwebmanagement.com/services/migration/weebly-square-online)
- Automattic: no revenue disclosed in what was found. Dated context: board forced CEO Mullenweg into leave on ~9 Sep 2026, reversed after 33 hours (Fortune, 19 Oct 2026); 159 staff left after the 2024 "quit with severance" offer; WP Engine antitrust claims revived by the judge on 24 Sep 2026 (treble damages possible); WordPress.org domain/infrastructure is personally owned by Mullenweg per the court summary — [TechCrunch, 2026-09-09](https://techcrunch.com/2026/09/09/automattics-board-forces-ceo-matt-mullenweg-into-leave-of-absence), [Fortune, 2026-10-19](https://fortune.com/2026/10/19/inside-the-33-hour-failed-boardroom-coup-to-overthrow-wordpress-founder-matt-mullenweg), [The Repository, 2026-10-02](https://therepository.email/wp-engine-v-automattic-two-years-on-where-the-wordpress-drama-stands), [JNK Plugins, 2026-10-14](https://jnkplugins.com/blog/wp-engine-automattic-lawsuit-explained)

### Inferences
- Shopify's flywheel: subscription revenue is only about 24% of revenue; payments (take rate on 68% of GMV) is the profit engine. That makes Shopify's incentives pro-volume, pro-upmarket, and explains the fee ladder and gateway surcharges.
- Wix's profits are being traded for AI bets (FCF -64% YoY in Q2). Its freemium funnel (304M+ signups, ~2% paying) plus long-term plans (83% annual+) is the core economics.
- GoDaddy's retention (>85%) is a domain-anchored moat, but its own disclosure that template builders are being replaced shows the classic drag-and-drop builder is in secular decline against AI-prompted sites.
- Commerce.com's NRR below 100% and flat revenue show that mid-market SaaS commerce without Shopify's payments/network effects stagnates.

### Gaps
- Squarespace 2025/2026 revenue, subscribers and churn: not public.
- Shopify, Wix, GoDaddy do not disclose logo churn; only Wix (NRR 105%), GoDaddy (retention >85%), Commerce.com (NRR 95.8%) give proxy metrics.
- Hostinger, Webflow, Framer, Jimdo, Ecwid, Shopware: no audited 2025/26 figures found; Hostinger figures are second-hand.
- Automattic revenue and WooCommerce GMV not found (WooCommerce GMV estimated at $30-35B annually by Vendrux, 2026-05-27, source unclear).
- Q3 2026 results for Shopify, Wix and GoDaddy were not yet published at the research date.

---

## 3. Why each platform is popular

### Takeaway
Success rests on a small number of repeatable mechanics: (1) a free or near-free funnel (Wix, Hostinger, WordPress software), (2) an ecosystem that lets third parties fill product gaps (WordPress plugins, Shopify apps), (3) payments built in and monetised (Shopify, Wix, Square), (4) an agency/partner channel with recurring incentives (Shopify 20% recurring commission), (5) bundled domain+hosting+email distribution (GoDaddy, Hostinger, Squarespace/Google Domains), and (6) design quality as brand (Squarespace, Webflow, Framer).

### Cited Findings

WordPress (self-hosted, WooCommerce, builders, WordPress.com):
- Ecosystem scale: 76,114 free plugins and 15,285 free themes in the WordPress.org directory; 17,745 plugins added in 2026; WooCommerce 7M+ active installs, 466M+ downloads — [WPExposure, 2026-10-18](https://wpexposure.com/research/wordpress-statistics), [Colorlib, 2026-10-01](https://colorlib.com/wp/woocommerce-statistics)
- Cost and ownership: software free; open source; host-portable ("move a WordPress site to a new host in an afternoon"); no platform transaction fee on WooCommerce — [Sage Digital Agency, 2026-10-14](https://sage.agency/blog/webflow-vs-wordpress), [Digitelle, 2026-01-27](https://digitelle.no/woocommerce-vs-shopify-hvilken-nettbutikklosning-bor-du-velge-i-norge)
- SEO and content control: Norwegian agencies say WooCommerce gives more technical SEO control than Shopify (Shopify has fixed /products/ and /collections/ URL structure) — [Digitelle, 2026-01-27](https://digitelle.no/woocommerce-vs-shopify-hvilken-nettbutikklosning-bor-du-velge-i-norge)
- Norwegian integrations: official Vipps, Klarna, Nets Easy, Bring/PostNord, Tripletex/Fiken/Visma plugins for WooCommerce are mature, and Norway has many WooCommerce agencies — [Digitelle](https://digitelle.no/woocommerce-vs-shopify-hvilken-nettbutikklosning-bor-du-velge-i-norge), [Nokto, 2026-04-12](https://nokto.no/blogg/shopify-vs-woocommerce)
- Page builders: Elementor free version is a real builder (10M+ installs); Divi sells unlimited sites for $89/year or $249 lifetime, which agencies like; Divi 5 left beta 26 Feb 2026 (rewritten, shortcode-free); Elementor Editor V4 default on new sites since April 2026 — [Sage Digital Agency, 2026-10-14](https://sage.agency/blog/elementor-vs-divi). Both vendors' performance claims are self-reported/unverified.
- WordPress.com: managed WordPress from $4/month (yearly) with plugins on Personal, developer tools (SFTP/SSH, staging, GitHub, real-time backups) on Business $25/month; free migration — see Q6 — [eSEOspace, 2026-10-01](https://eseospace.com/blog/wordpress-com-plans)

Shopify:
- Payments and checkout: Shop Pay GMV +53% YoY; payments penetration 68% of GMV; local payment methods being added (Mexico); Payments in 40 countries including Norway — [Yahoo/Zacks, 2026-09-30](https://finance.yahoo.com/markets/stocks/articles/shopifys-merchant-solutions-growth-accelerates-131600831.html), [Ecommercetrix, 2026-07-23](https://ecommercetrix.com/ecommerce-statistics/shopify-statistics)
- Ecosystem: 21,000+ apps; $1.3B paid to developers in 2025; 100,000+ partners claimed; app developers keep 100% of first $1M lifetime revenue then pay 15% (lifetime cap since 16 Jun 2025, counted from 1 Jan 2025); agencies earn 20% recurring commission on referred merchants' subscription fees indefinitely, with five quarterly-evaluated agency tiers — [Shopify, 2026-04-28](https://shopify.com/news/billion-dollar-ecosystem), [Taylor Sicard, 2026-05-26](https://taylorsicard.com/blog/shopify-partner-program-2026), [Ecommercetrix](https://ecommercetrix.com/ecommerce-statistics/shopify-statistics)
- Hosted and fully managed: no servers, updates or PCI burden (PCI DSS Level 1); Norwegian agencies recommend Shopify as default for new Norwegian shops with Vipps/Klarna as apps and Tripletex/Fiken/Visma integrations — [Nokto, 2026-04-12](https://nokto.no/blogg/starte-nettbutikk-norge), [Nokto Shopify Norge](https://nokto.no/shopify-norge)
- B2B moved down-market: since April 2026 core B2B (company profiles, price lists, net terms) is available on Basic, Grow and Advanced, not only Plus — [Shero Commerce, 2026-10-01](https://sherocommerce.com/blogs/insights/shopify-pricing)
- Trial funnel: 3 days free then about $1/month (NOK 9/month in Norway) for 3 months; new "Starter" ($5) and "Agentic" ($0 plan, from 2.9%+30c on direct-checkout orders) plans exist — [Shopify Norge blog, 2026-05-19](https://shopify.com/no/blog/beste-nettsidebygger-for-nettbutikker), [eSEOspace, 2026-10-01](https://eseospace.com/blog/shopify-pricing-plans)

Wix (incl. Studio):
- Freemium scale: 304M+ registered users, 6.11M premium subscriptions, 85,000+ sites created per day (Wix claim); free plan is permanent (Wix subdomain, ads) — [Tech Glean, 2026-10-15](https://techglean.com/wix-statistics-2026-users-revenue-market-share)
- Monetisation breadth: Creative Subscriptions plus Business Solutions (Google Workspace, email marketing, paid ads) plus payments/transaction revenue ($71.5M in Q2); net revenue retention 105% — [Wix Q2 2026 release](https://globenewswire.com/news-release/2026/08/04/3338018/0/en/wix-reports-second-quarter-2026-results.html), [Investing.com slides](https://ca.investing.com/news/company-news/wix-q2-2026-slides-ai-push-drives-15-revenue-growth-93CH-4774656)
- Wix Studio is a separate agency product with its own plans ($19-$159/month yearly), client management and multi-site tools; Wix Harmony AI editor (Jan 2026) mixes prompt-based creation with visual editing; Base44 for prompt-built apps — [LitExtension, 2026-06-26](https://litextension.com/blog/wix-pricing), [WebChoiceDesk](https://webchoicedesk.com/en-us/wix-review)
- Support promise: 24/7 customer care; Trustpilot praise centres on ease of use and template range — [Trustpilot (Irish page), 2026-10-19](https://ie.trustpilot.com/review/www.wix.com?page=10)

Squarespace:
- Design-first brand and templates; best INP (responsiveness) pass rate of the major platforms at 98%; bundled Google Workspace email and (since 2024) Google Domains base; all plans now include subscriptions, abandoned-cart recovery, customer accounts, gift cards, POS (US/UK) — [Colorlib, 2026-10-01](https://colorlib.com/wp/squarespace-statistics), [SquareLocator, 2026-10-08](https://squarelocator.com/blogs/insights/is-squarespace-good-for-ecommerce)
- Ratings: Capterra 4.6 (3,409 reviews), G2 4.4 (1,135), Trustpilot 3.4 (4,440 per one source; 6,026 per another), TrustRadius 8.4/10 — [StyleFactory, 2026-07-21](https://stylefactoryproductions.com/blog/squarespace-review), [LeapScope, 2026-10-09](https://leapscopeai.com/tools/squarespace)

Webflow:
- Design control (CSS/animation visually), real CMS (20,000 items on Premium), hosting with CDN/SSL/backups included, no plugin maintenance; strong in B2B SaaS marketing sites; over-represented among the top 10k sites (2.3% of known-CMS) — [Sage Digital Agency, 2026-10-14](https://sage.agency/blog/webflow-vs-wordpress), [Octoagency](https://octoagency.io/blog/webflow-statistics)
- Agency model: Freelancer ($16) and Agency ($35) Workspace plans with free client seats; Team plan $2,500/month added May 2026 for scale-ups — [JustPricing, 2026-09-06](https://justpricing.com/webflow-pricing), [Webnomads, 2026-07-08](https://webnomads.com/resources/webflow-pricing)

Framer:
- Fast-growing, design/AI-first builder: ARR doubled (about $25M in 2024 estimate to about $50M in 2025); reported usage by about 40% of the latest YC batch (second-hand claim); ~4M sites; cheap entry ($10/month Basic) — [Devgraphiq](https://devgraphiq.com/framer-statistics), [ProductGrowth.in, 2026-01-01](https://productgrowth.in/tools/design/framer)

Adobe Commerce/Magento: see Q5. Why chosen: complex catalogues, B2B, no platform transaction fees, deep customisation, existing Adobe stack — [Ecompanda, 2026-10-17](https://ecompanda.co/blog/magento-alternatives)

BigCommerce / Commerce.com:
- Positioned as open/headless, B2B-friendly, API-first; historically the "no transaction fees" Shopify alternative, 15-day trial without card; B2B GMV +17% (ahead of platform) — [Commerce.com Q2 2026 call](https://finance.yahoo.com/markets/stocks/articles/bigcommerce-q2-earnings-call-highlights-130400567.html), [eSEOspace, 2026-10-01](https://eseospace.com/blog/shopify-vs-bigcommerce)

Hostinger:
- Price: Premium $2.99/month for 48 months (renewal $10.99); cheapest hosted-builder entry; includes free domain first year, email; AI builder with manual and agentic modes; Kodee AI support handling 1M+ conversations monthly at 85% automation; revenue +51% — [Akta, 2026-10-19](https://akta.pro/company-profiles/0000iwu/hostinger), [WebHostTraining, 2026-07-15](https://webhosttraining.com/hostinger-ai-website-builder-review)

GoDaddy (incl. Airo):
- Distribution: domain registrar with 20.5M customers; >50% have 2+ paid products; retention >85%; phone/chat/text 24/7 support is a real differentiator for non-technical users; Airo generates site, logo, email, social profiles and ads in one flow (generation in about 30 seconds to 2 minutes); Capterra 4.4/5 (~1,379 reviews) for the builder — [Litmus, 2026-06-27](https://litmustools.com/review/godaddy-airo), [VibeYourWebsite, 2026-08-04](https://vibeyourwebsite.com/godaddy-airo-review), [HostAdvice, 2026-06-22](https://ca.hostadvice.com/hosting-company/godaddy-reviews/godaddy-website-builder-review)

Square Online / Weebly:
- Only major platform with a useful free e-commerce plan (unlimited products, 3.3%+30c online); strength is Square POS plus unified inventory for retail/restaurants; unified Free/Plus ($49)/Premium ($149) per-location plans announced 6 Oct 2025 — [StartupLaunchPage, 2026-05-25](https://startuplaunchpage.com/blog/best-ecommerce-platform-for-small-business-2026), [eSEOspace, 2026-10-05](https://eseospace.com/blog/wix-vs-square-online)

Ecwid:
- "Bolt-on" store embeddable into any existing site; 0% transaction fee; G2 4.7/5 — [StartupLaunchPage](https://startuplaunchpage.com/blog/best-ecommerce-platform-for-small-business-2026), [TechnologyChecker](https://technologychecker.io/compare/wix-vs-weebly)

Jimdo:
- Dolphin AI builder pulls content from Google Business Profile/social to auto-populate a site; GDPR-compliant by default; German/EU brand; free plan; "Companion AI" advisor (late 2025) — [Softabase, 2026-03-25](https://softabase.com/software/website-builder/jimdo), [HostAdvice, 2026-03-18](https://hostadvice.com/tools/web-hosting-comparison/jimdo-vs-wix-com)

Shopware:
- DACH-native legal compliance (Impressum, Widerruf, Datenschutz in core), API-first/headless, native B2B components, Germany's most-used shop platform among top-1000 B2C shops for four consecutive years per Shopware; free Community edition (up to EUR 1M GMV per one source) — [Qualimero, 2026-03-29](https://qualimero.com/en/blog/shopware-vs-woocommerce), [Qualimero, 2026-03-30](https://qualimero.com/en/blog/shopware-online-shop-2025-costs-setup-ai-consultation-guide)

### Inferences
- The most replicable advantages for a Norwegian platform: (a) a payment+checkout layer integrated with Vipps/Klarna/Bring out of the box (Shopify and WooCommerce both need apps/plugins in Norway), (b) an agency recurring-commission channel (Shopify's 20% recurring is the benchmark), (c) legal/GDPR/MVA/EHF compliance native (Shopware's DACH playbook), (d) transparent pricing, since renewal-hike and fee-stacking complaints are the most common negatives (Q4).
- Platforms that win SMEs have a distribution moat that is not the editor: domains/email (GoDaddy, Squarespace), hosting price (Hostinger), POS (Square), payments (Shopify), freemium volume (Wix).

### Gaps
- No independent customer-survey data on why SMEs choose a platform (only vendor and agency claims).
- Little Norwegian-language evidence on Wix/Squarespace adoption reasons.
- Shopify "Starter"/"Agentic" plans are described inconsistently across sources (Starter reported at $5; one source says 5%+30c fee); verify on shopify.com before relying on them.

---

## 4. Main weaknesses and recurring customer complaints

### Takeaway
Across platforms the recurring complaints are: (1) lock-in (Wix, GoDaddy, Squarespace, Webflow dynamic features), (2) fee stacking and surprise costs (Shopify apps and gateway fees, Wix/Square/Webflow transaction fees, renewal hikes at Hostinger/GoDaddy/Squarespace), (3) support degraded to AI/chatbots with no phone (Shopify, Wix, Squarespace), (4) WordPress security and plugin maintenance burden, and (5) payout holds/account suspensions on payment-integrated SaaS.

### Cited Findings

WordPress / WooCommerce / page builders:
- Security: Patchstack counted 11,334 new vulnerabilities in the WordPress ecosystem in 2025 (+42% vs 2024); 91% in plugins, 9% in themes, only 6 in core (all low risk); 46% had no developer fix at public disclosure; weighted median 5 hours to first exploitation for the most-attacked flaws and about half of high-impact flaws exploited within 24 hours; premium/freemium components had 3x more known-exploited vulnerabilities than free ones; general-purpose security tools blocked only 12% of attacks on known exploited WP vulnerabilities (Patchstack sells its own protection, so treat as vendor-sourced) — [Patchstack, 2026-02-12](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026), [WP-Content, 2026-03-10](https://wp-content.co/patchstack-wordpress-security-report-2026-vulnerabilities-rises-hosting-defenses-struggles), [DataYard, 2026-10-15](https://datayard.us/cybersecurity/wordpress-plugin-vulnerabilities-2026)
- 2026 incidents: Elementor Pro (6M+ installs) critical file-upload RCE CVE-2026-32475 exploited the day the fix shipped; All-in-One WP Migration SQLi (5M+ installs; ~65% unpatched two weeks later); UpdraftPlus auth bypass (3M+ installs) — [DataYard, 2026-10-15](https://datayard.us/cybersecurity/wordpress-plugin-vulnerabilities-2026)
- Maintenance debt: 36.4% of WordPress sites on PHP versions without security support (StatisticsGlobal calc) or 35.3% below PHP 8.2 (WPExposure); 46.5% of directory plugins not updated for 2+ years; mobile Core Web Vitals pass rate for WordPress origins 52.8% (CrUX, Sep 2026) — [StatisticsGlobal, 2026-10-21](https://statisticsglobal.org/wordpress-statistics), [WPExposure](https://wpexposure.com/research/wordpress-statistics)
- Cost reality: Norwegian agencies price WooCommerce build at NOK 40,000-100,000 plus hosting NOK 500-1,500/month and maintenance; managed hosting plus plugins puts real monthly cost at NOK 550-1,850 vs Shopify Basic NOK 389 — [Infoframe, 2026-06-25](https://infoframe.no/artikler/lage-nettbutikk), [Nokto, 2026-04-12](https://nokto.no/blogg/shopify-vs-woocommerce)
- Governance risk: WP Engine v. Automattic (see Q2), Mullenweg personally controls WordPress.org; EU Cyber Resilience Act will require vulnerability disclosure programs for commercial plugins in 2026 (Patchstack) — [The Repository, 2026-10-02](https://therepository.email/wp-engine-v-automattic-two-years-on-where-the-wordpress-drama-stands), [Patchstack](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026)
- Builders: Elementor and Divi historically criticised for DOM/CSS bloat; both rewrote engines in 2026 (Elementor V4 atomic, Divi 5). Divi 5 claims frontend JS 276KB to 45KB (vendor-adjacent agency claim). Independent benchmarks of the new versions were not found: "the builder is rarely the reason a site is slow" — [Sage Digital Agency, 2026-10-14](https://sage.agency/blog/elementor-vs-divi), [Nicada Digital, 2026-03-31](https://nicadadigital.com/web-design-and-marketing-help-guides/divi-vs-elementor). Elementor pricing is per site and rising: One bundle $180 first year then $228; One Agency $432 then $540 — [ResponsiveMiracle, 2026-10-19](https://responsivemiracle.com/divi-vs-elementor)
- WordPress.com: payment-block fees 10% Free, 8% Personal, 4% Premium, 2% Business, 0% Commerce; Woo Express discontinued; premium plugin licenses billed separately — [eSEOspace, 2026-10-01](https://eseospace.com/blog/wordpress-com-plans), [Gatilab, 2026-08-16](https://gatilab.com/wordpress-com-plans)

Shopify:
- Trustpilot 1.3/5 from 4,404-4,758 reviews (Shopify has not invited reviews, so skews negative; Shopify's profile shows it does not reply to negative reviews); BBB rating F with 1,661 complaints (per ecomreality, a critical review site) — [EcomReality, 2026-03-22](https://ecomreality.com/shopify-review-2026), [CheckThat.ai, 2026-06-25](https://checkthat.ai/brands/wix/alternatives)
- Analysis of 5,851 one- and two-star App Store reviews across 209 apps: billing and charges 23% (price changes on locked-in customers, charges continuing after uninstall, refunds not arriving), support never replies 17%, "stopped working" 12%, hard to set up 6%, missing feature 3% (single-author analysis in Shopify Community, not independently verified) — [Shopify Community, 2026-09-04](https://community.shopify.com/t/i-read-5-851-one-and-two-star-app-reviews-the-1-complaint-isnt-what-i-expected/676424/3)
- App cost creep: a typical modest store reports $150-300/month in apps (EcomReality); one agency says stores running 15-20 apps see app bills rivalling the plan, often through overlap; a competitive-intelligence sample (fieldread, Oct 2026) counted "customization and platform limits" (72 records), "app and add-on costs add up" (58), "third-party gateway and transaction fees" (53) as top complaint themes — [EcomReality](https://ecomreality.com/shopify-review-2026), [Nexly, 2026-10-04](https://nexly.com.au/blog/leaving-shopify-for-another-platform), [Fieldread sample report, 2026-10-16](https://fieldread.co/samples/shopify/report.pdf)
- Checkout lock-down: checkout.liquid removed in favour of Checkout Extensibility; merchants lost custom scripts on Thank You/Order Status pages and must pay for apps or custom app development (Trustpilot Apr 2026) — [Trustpilot NZ page 2, 2026-04-11](https://nz.trustpilot.com/review/www.shopify.com?page=2), [Nexly](https://nexly.com.au/blog/leaving-shopify-for-another-platform)
- Fee steps: Shopify Payments needs country support; third-party gateway fee 2%/1%/0.6%/0.2% on Basic/Grow/Advanced/Plus; running Shopify Payments plus another provider adds a 1.25% premium on Shop Pay/local methods; plan jump $399 (Advanced) to $2,300+ (Plus) flagged on G2 as steep — [TheBuildly, 2026-10-21](https://thebuildly.com/blog/shopify-fees-in-2026-what-you-really-pay-per-month-and-per-sale), [Fieldread](https://fieldread.co/samples/shopify/report.pdf)
- Support and payouts: phone support limited (priority 24/7 phone on Plus only; live chat on Basic); reports of AI chatbot loops, frozen payouts (up to 120 days), store bans without explanation, charges after cancellation (individual Trustpilot reviews, April 2026; self-selected) — [Trustpilot](https://nz.trustpilot.com/review/www.shopify.com?page=2), [EcomReality](https://ecomreality.com/shopify-review-2026). Counterpoint: a Reddit developer argued that clients typically pay $70-150/month for plan plus apps and Shopify can be cheaper to operate than WooCommerce; others note agencies are paid referral commissions and over-recommend Shopify — [Reddit r/woocommerce, 2026-05-22](https://reddit.com/r/woocommerce/comments/1tkgnac/shopify)
- Lock-in: not a theme-portable platform; Norwegian agency pages state "you do not own the platform" and customisation is limited vs WordPress — [Infoframe, 2026-06-25](https://infoframe.no/artikler/lage-nettbutikk)

Wix:
- Billing is the largest complaint category on Trustpilot: auto-renewals of $300-$800+ after opting out, refunds only within 14 days, contested charges taking up to 45 working days — [CheckThat.ai, 2026-06-25](https://checkthat.ai/brands/wix/alternatives), [Trustpilot FR, 2026-10-22](https://fr.trustpilot.com/review/www.wix.com?stars=1). Trustpilot score 3.4/5 on 1 Oct 2026 — [Baadigi, 2026-10-01](https://baadigi.com/guides/websites/wix-alternatives)
- Lock-in: Wix's own help page says the site "needs to be hosted and operated on Wix's servers"; no design/code export; only blog posts export (XML) and CSVs of contacts/CMS; images on Wix CDN break after cancellation; a template cannot be switched after build — [StudioSlate, 2026-03-01](https://studioslate.com.au/blog/wix-alternatives), [Baadigi](https://baadigi.com/guides/websites/wix-alternatives)
- Support: "bot-first" support, escalation loops; a Trustpilot case of an unauthorised account-control change and payout bank details changed — [CheckThat.ai](https://checkthat.ai/brands/wix/alternatives), [Trustpilot IE, 2026-10-19](https://ie.trustpilot.com/review/www.wix.com?page=10) (individual reviews, unverified)
- Fees and plan gating: Light plan cannot accept payments; Pricing Plans (memberships/subscriptions) fee 4% Core, 2% Business, 0% Elite (one source says 4% applies to e-commerce generally, but Wix-focused sources scope it to Pricing Plans only); Business to Business Elite is a $39 to $159 jump — [eSEOspace, 2026-10-05](https://eseospace.com/blog/wix-plans-compared), [CheckThat.ai](https://checkthat.ai/brands/wix/alternatives)
- Forced editor changes (e.g. Harmony transition) reported to break layouts without rollback; renewal hikes (a user cites $120 to $500+/year on a long-term blog) — [TrustHostReview, 2026-07-23](https://trusthostreview.com/hosting-company/wix-com-review)

Squarespace:
- July 2026 price increase of up to 26% (annual Basic $16 to $19, Core $23 to $29, Plus $39 to $49, Advanced unchanged at $99; monthly Core $36 to $39, Plus $56 to $65) — [PetaPixel, 2026-07-17](https://petapixel.com/2026/07/17/squarespace-is-increasing-prices-by-up-to-26)
- Trustpilot 3.4/5 with ~40% one-star: complaints on AI-reliant support, no phone support, domain transfer trouble, billing after cancellation; admin app crashes (22% of one sample) — [LeapScope, 2026-10-09](https://leapscopeai.com/tools/squarespace), [EcommerceGuide, 2026-10-01](https://ecommerceguide.com/platforms/squarespace-commerce)
- Product limits: no multi-currency, limited gateways (Squarespace Payments/Stripe/PayPal), no native product filtering, 250 variants per product, small Extensions ecosystem, template switching not possible, Weglot translation gets expensive; transaction fee 2% on Basic; courses/memberships fee 7%/5%/1%/0% — [StyleFactory, 2026-07-21](https://stylefactoryproductions.com/blog/squarespace-review), [SquareLocator, 2026-10-08](https://squarelocator.com/blogs/insights/is-squarespace-good-for-ecommerce)

Webflow:
- Pricing complexity (Site plan plus Workspace plan plus seats plus add-ons); 13 May 2026 restructure into Basic/Premium/Team; export limits: HTML/CSS/JS export only on paid Workspace plans and excludes CMS, e-commerce, forms, site search, localisation; User Accounts feature shut down January 2026 (so native memberships/subscriptions ended); weak e-commerce (Standard plan 2% fee, two gateways, poor non-US tax handling); steep learning curve; Trustpilot 1.4/5 (226 reviews) on support — [Webnomads, 2026-07-08](https://webnomads.com/resources/webflow-pricing), [Sage Digital Agency](https://sage.agency/blog/webflow-vs-wordpress), [Digitally Sound, 2026-09-01](https://digitallysound.ie/blog/what-is-webflow-worth-it-2026), [Pay Developers, 2026-05-07](https://paydevelopers.com/blog/webflow-review-2026)
- Cost at scale: 10 client sites $230-$390/month vs $50-$100 on managed WordPress (one agency estimate) — [Pay Developers](https://paydevelopers.com/blog/webflow-review-2026)

Framer:
- Per-site plans plus per-editor seats ($20 full, $10 content) plus usage add-ons (pages, CMS items, bandwidth, locales $20 each); AI credits metered; legacy plans grandfathered before 9 Oct 2025; lock-in trade-off flagged in reviews; W3Techs share only 0.2% — [Usagepricing, 2026-08-11](https://usagepricing.com/blueprint/framer), [TheProofDesk, 2026-10-15](https://theproofdesk.com/framer-review)

BigCommerce / Commerce.com:
- 1 June 2026 changes: plans renamed (Core/Growth/Scale/Performance); GMV caps for forced auto-upgrade cut (Core $50k to $30k; Growth $180k to $100k, now computed as gross order value minus 10% and including tax and shipping); "Open Payment Provider fee" of 2%/1%/0.6% on orders through non-"Embedded" gateways; i.e. the "no transaction fees" differentiator was removed. Native B2B custom pricing only on Performance at the time of the Shero comparison — [Frooition, 2026-07-27](https://frooition.com/blog/bigcommerce-pricing-changes-2026), [Shero Commerce, 2026-06-12](https://sherocommerce.com/blogs/insights/bigcommerce-pricing-guide). (Some older secondary pages still show the pre-June caps; use Frooition/Shero/eSEOspace.)

GoDaddy:
- Intro-to-renewal jumps (Websites + Marketing Basic $9.99 to $16.99/month, Premium $14.99 to $29.99, Commerce $20.99 to $34.99; Airo Plus $59.88 to $95.88/year; WP hosting Basic $6.99 to $14.99), aggressive upsells, no code export or custom code on Websites + Marketing, generic AI output, auto-publish quirk, thin SEO/analytics, no app marketplace; reports of $900+ of unwanted add-ons on one account (Reddit via Litmus); Commerce plan 2.7%+30c per transaction on top of processing — [Litmus, 2026-06-27](https://litmustools.com/review/godaddy-airo), [VibeYourWebsite, 2026-08-04](https://vibeyourwebsite.com/godaddy-airo-review), [HostAdvice, 2026-08-30](https://hostadvice.com/hosting-company/godaddy-reviews/airo-pricing). Note: the newer Airo AI Builder (code-based) allows code download on paid plans — [WebBuilding.net, 2026-10-02](https://webbuilding.net/platforms/godaddy). GoDaddy's older plan family was not found on current official pages.

Hostinger:
- Prices require 48-month prepay; renewals are 3.3-4.3x the intro rate (Premium $2.99 to $10.99; Unlimited $3.99 to $16.99; Cloud Startup $7.99 to $25.99); AI credits on plans are small and described as one-time; template cannot be swapped after launch; export moves content, not design — [WebHostTraining, 2026-07-15](https://webhosttraining.com/hostinger-ai-website-builder-review), [Vibecoding.app, Sep 2026](https://vibecoding.app/blog/hostinger-horizons-review)

Square Online / Weebly / Ecwid / Jimdo:
- Weebly: development slowed since Square acquisition; 3% transaction fee on lower plans; being shut down in 67 countries (27 Sep 2026 unpublish, 26 Dec 2026 closure) — [StartupLaunchPage](https://startuplaunchpage.com/blog/best-ecommerce-platform-for-small-business-2026), [Boykin Web Management](https://boykinwebmanagement.com/services/migration/weebly-square-online)
- Square Online: higher card rate on the free plan (3.3%+30c), limited customisation/SEO/app ecosystem — [StartupLaunchPage](https://startuplaunchpage.com/blog/best-ecommerce-platform-for-small-business-2026)
- Ecwid: free plan closed to new sign-ups March 2025 and remaining free stores forced to $5 Starter by 20 Nov 2025 or taken offline; prices on Venture/Business/Unlimited raised 2 Mar 2026 — [YourNextStore, 2026-05-11](https://yournextstore.com/blog/ecwid-alternatives)
- Jimdo: support by ticket only (reply 1-2 working days), no chat/phone; Dolphin AI editor permits no custom code and has no app market; sites cannot move between Dolphin and Creator editors; no template library in Dolphin — [Honest Reviews, 2026-10-15](https://honest-reviews.org/website-builders/ionos-website-builder-vs-jimdo), [HostAdvice, 2026-03-18](https://hostadvice.com/tools/web-hosting-comparison/jimdo-vs-wix-com), [AgentSite, 2026-10-01](https://agentsite.ai/blog/jimdo-pricing)

Shopware:
- Highest entry price among peers (Rise from EUR 600/month, GMV-based; Evolve from EUR 2,400); thin ecosystem outside Germany (67% of stores in Germany, ~800 in Netherlands); StoreLeads shows store count shrinking (-6% YoY) as the platform moves to "fewer but larger customers" — [Codemaker-S, 2026-08-09](https://codemaker-s.com/en/platform/shopware)

### Inferences
- The most damaging recurring brand harm across Wix, Squarespace, GoDaddy, Hostinger, Shopify is billing opacity (auto-renewals, intro-to-renewal jumps, post-cancellation charges), which is solvable by policy rather than technology. Support quality ("AI-only, no phone, no escalation") is the second.
- WordPress's weakness is operational (plugins, patching, hosting quality) rather than core; this matches the pain agencies like Helene's solve with maintenance agreements. Premium-plugin risk (3x KEV) is relevant for page-builder-heavy sites.
- Lock-in is a stated worry mainly for Wix/GoDaddy/Squarespace/Webflow-dynamic; a platform that offers a genuine "take your data and site with you" promise (structured export, open formats, own domain) differentiates strongly.
- Regulatory tailwind for EU-built platforms: GDPR-native, MVA/EHF, cookie compliance (Shopware's selling point); not verified for Norway-specific regulation here (see Gaps).

### Gaps
- Most complaint evidence is self-selected review text (Trustpilot, Reddit) and vendor-written comparison blogs (several with affiliate incentives); no representative customer-satisfaction survey was found.
- No comparable independent performance (Core Web Vitals) benchmark across platforms from the same dataset except WordPress mobile pass rate (52.8%) and Squarespace INP 98%.
- Norway-specific regulation (accessibility act/UU-tilsynet, e-commerce law) not researched here; per CLAUDE.md-type guidance, regulatory claims should be checked separately.

---

## 5. Magento / Adobe Commerce status in 2026

### Takeaway
Magento is not dead (2.4.9 shipped 12 May 2026, supported to 31 May 2029) but the install base is shrinking, the cost to stay (license, hosting, specialist developers, forced upgrades, critical security patching) and to leave (typically five to six figures) is high, and Adobe's strategy has moved to SaaS (Adobe Commerce as a Cloud Service, Commerce Optimizer). Merchants still on it are mid-market B2B/complex-catalogue businesses and Adobe-stack enterprises; the community fork Mage-OS is the open-source hedge. Several viral 2026 articles claiming Adobe "abandoned" Open Source are unreliable.

### Cited Findings
- Version/support facts per Adobe's lifecycle policy (last updated 18 Sep 2026, as quoted): 2.4.9 GA 12 May 2026, standard support to 31 May 2029; 2.4.8 to 31 May 2028; 2.4.7 to 31 May 2027 (extended to 31 May 2028, Adobe Commerce only); 2.4.6 standard ended 11 Aug 2026 (extended to 31 Aug 2027, security-only to 31 May 2028); 2.4.5 and 2.4.4 past extended support, security-only to 31 May 2027. Extended support is for paying Adobe Commerce customers; Magento Open Source gets no extended support. Adobe Commerce Cloud environments on unsupported versions to be decommissioned from 1 Jun 2027 (2.4.4/2.4.5) and 1 Jun 2028 (2.4.6/2.4.7) — [Ecompanda, 2026-10-17](https://ecompanda.co/blog/magento-alternatives), [EveryHost, 2026-09-21](https://everyhost.co.uk/magento-end-of-life), [x2y.dev, 2026-08-22](https://x2y.dev/blog/what-happens-to-your-magento-store-after-end-of-support)
- Adobe has not said Open Source is going away but "just says very little about it"; energy is on SaaS: Adobe Commerce as a Cloud Service and Commerce Optimizer (a storefront/merchandising layer that sits on top of any backend, explicitly "without re-platforming") — [Dev.to Mage-OS post, 2026-10-07](https://dev.to/laurnts/why-we-migrated-all-our-customers-to-mage-os-what-is-mage-os-anyway-compared-to-magento-2-2min), [Sellarix, 2026-07-22](https://sellarix.ai/resources/blog/replatforming)
- Security pressure: Mage-OS emergency release 3.5.0 (8 Sep 2026) ported Adobe's hotfix for CVE-2026-75650 "StyleSmuggler", CVSS 10.0 unauthenticated RCE exploited in the wild since 4 Sep 2026; Mage-OS 3.6.0 (14 Oct 2026) ported Adobe's APSB26-153 with further CVSS 10.0 fixes — [Mage-OS, 2026-10-14](https://mage-os.org)
- Mage-OS (non-profit community distribution of Magento Open Source) 3.0 released May 2026 on Magento 2.4.9, tracks Adobe patches within days, no licence fee, no direct commercial support (via agencies) — [Mage-OS FAQ via Ecompanda, 2026-10-17](https://ecompanda.co/blog/magento-alternatives)
- Market position: BuiltWith top-1M e-commerce ~9% Magento/Adobe Commerce (2025 data), ~7% of top-10k; StoreLeads ~130,000 stores (cited March 2026) vs a July 2026 claim of ~41,000 active Magento 2.x storefronts "per BuiltWith" (the latter from ecommerce-times, unreliable) — [Vendrux, 2026-05-27](https://wordpress.vendrux.com/ecommerce-platform-market-share-usa), [Qualimero, 2026-03-30](https://qualimero.com/en/blog/shopware-online-shop-2025-costs-setup-ai-consultation-guide), [Ecommerce Times, 2026-07-21](https://ecommerce-times.com/adobe-commerce-quietly-exits-mid-market-and-shopify-is-already-moving-in)
- Typical costs: Adobe publishes no price list. Reported mid-market Adobe Commerce Cloud licence about $40,000/year, GMV-based and rising each renewal (a single agency principal's dev.to case series via MGT-Commerce; ecommerce-times says up from ~$32,800 but is unreliable). Upgrade within Magento: EUR 50,000-150,000 to 2.4.8 LTS; replatform to a composable B2B platform EUR 100,000-350,000 in year 1 excluding run costs (French integrator djust, 2026-09-08). Replatform to Shopify Plus, from ecommerce-times (unreliable) agency quotes: $45-90k simple, $120-280k mid-complexity, $300-600k+ complex. A documented three-client series: B2B Suite rebuild alone priced at ~$120,000; one client stayed. Maintenance cost of legacy Magento "doubled in three years" (djust) — [Djust, 2026-09-08](https://djust.io/en/blog/ecommerce/magento-migration-where-to-start-your-replatforming-project), [MGT-Commerce, 2026-07-10](https://mgt-commerce.com/blog/adobe-commerce-cloud-alternatives), [Ecommerce Times, 2026-07-21](https://ecommerce-times.com/adobe-commerce-quietly-exits-mid-market-and-shopify-is-already-moving-in)
- Where merchants go: claims that ~68% of net-new Shopify Plus onboards at four top agencies came off Adobe Commerce in H1 2026 (vs 41% in 2024) are from ecommerce-times (unreliable; unverified). Other destinations named: BigCommerce, WooCommerce, SFCC, commercetools, Shopware (in DACH), staying on Mage-OS — [Ecompanda](https://ecompanda.co/blog/magento-alternatives), [Ecommerce Times, 2026-08-28](https://ecommerce-times.com/adobe-commerce-is-losing-mid-market-merchants-to-shopify-at-a-record-pace)
- Conflicting/unreliable: Ecommerce Times (20-21 Jul 2026) says Adobe confirmed ending Magento Open Source with security patches to "March 2027" in one article and "Q2 2028"/"April 2028" and "no new features" in another, and an entry licence hike of 22%; these contradict each other and Adobe's published 2.4.9 support to 2029 and are not corroborated by any other source found — [Ecommerce Times, 2026-07-21](https://ecommerce-times.com/adobe-commerce-quietly-exits-mid-market-and-shopify-is-already-moving-in) vs [Ecommerce Times, 2026-07-20](https://ecommerce-times.com/adobe-commerce-abandons-open-source-core-in-major-platform-pivot) vs [EveryHost, 2026-09-21](https://everyhost.co.uk/magento-end-of-life)
- Who still chooses/stays: B2B and complex catalogues, no transaction fees, deep customisation, ERP integration; Adobe-stack enterprises; "the average Magento store runs 34 extensions" (ecommerce-times, unverified) — [Ecompanda](https://ecompanda.co/blog/magento-alternatives)

### Inferences
- The realistic read: slow structural decline in the SME/mid-market, durable in complex B2B/enterprise. The addressable opportunity for a new platform is the large pool of Magento 2.4.4-2.4.6 stores needing an expensive decision, but the segment is high-complexity, high-ticket and agency-led; a Norwegian entrant would more likely win Norwegian mid-market B2C/B2B stores migrating from older custom or Magento builds than global Magento accounts.
- Treat any "Adobe is killing Open Source" claim as unproven until Adobe's own announcement is cited.

### Gaps
- No primary Adobe pricing or install-base figures; no BuiltWith/StoreLeads Norway Magento counts.
- Adobe press statement on Open Source future not located; relied on secondary quoting of the lifecycle policy.
- Typical Norwegian cost levels for Magento work not found.

---

## 6. Current pricing tiers (USD/EUR, NOK where shown), 2026

### Takeaway
Headline entry prices converge on about $15-30/month; real cost depends on (a) annual vs monthly billing (typically 25-45% cheaper annually), (b) transaction/gateway fees, (c) intro-to-renewal jumps and (d) add-ons. Norwegian NOK prices are published only by Shopify (Basic 389 / Grow 1,030 / Advanced 4,490 per month; Plus EUR 2,100).

### Cited Findings (USD per month, excl. VAT, as of Oct 2026 unless stated)

Shopify (US; yearly billing in parentheses) — [Shero Commerce, 2026-10-01](https://sherocommerce.com/blogs/insights/shopify-pricing), [ProsE-commerce, 2026-10-08](https://prosecommerce.com/shopify-plans), [eSEOspace, 2026-10-01](https://eseospace.com/blog/shopify-pricing-plans)
- Starter $5 (reported); Basic $39 ($29); Grow $105 ($79; formerly "Shopify"); Advanced $399 ($299); Plus from $2,300 on 3-year term, $2,500 on 1-year term (variable platform fee on revenue for complex/high volume). An "Agentic" $0 plan exists (from 2.9%+30c on direct-checkout orders).
- Shopify Payments online rates (US): 2.9%+30c / 2.7%+30c / 2.5%+30c / 2.25%+30c (Basic/Grow/Advanced/Plus). Third-party gateway surcharge: 2% / 1% / 0.6% / 0.2%. Staff accounts 0/5/15/unlimited.
- Regional pricing differs: EUR zone Basic EUR 32, Grow EUR 92, Advanced EUR 384, Plus from EUR 2,100; UK GBP 25/65/344, Plus from GBP 1,800 — [Shero Commerce](https://sherocommerce.com/blogs/insights/shopify-pricing). Türkiye-region page shows Basic $27 ($19 yearly), Grow $72 ($54) — [BoosterWizard, 2026-10-08](https://boosterwizard.com/en/blog/shopify-pricing)
- NORWAY (NOK, monthly / yearly-billing monthly equivalent): Basic 389 / 289; Grow 1,030 / 770; Advanced 4,490 / 3,370; Plus from EUR 2,100/month; card rate with Shopify Payments Basic 2%+NOK 2, Grow 1.9%+NOK 2, Advanced 1.8%+NOK 2; trial 3 days then NOK 9/month for 3 months; Shopify Payments requires org.nr, Norwegian bank account and BankID; Vipps is a separate provider (Vipps Checkout app) billed separately; Klarna via Klarna Payments app — [Shopify Norge blog, 2026-05-19](https://shopify.com/no/blog/beste-nettsidebygger-for-nettbutikker), [Nokto Shopify Norge, 2026](https://nokto.no/shopify-norge). (Older Norwegian agency pages quote ~NOK 350/920/3,680 and 2.9%+NOK 2.90 rates; superseded.)

WordPress / WooCommerce — [eSEOspace WordPress.com, 2026-10-01](https://eseospace.com/blog/wordpress-com-plans), [Elementor/Sage, 2026-10-14](https://sage.agency/blog/elementor-vs-divi)
- WordPress.org software and WooCommerce core: free. Hosting is separate: Norwegian WooCommerce hosting from about NOK 500/month (shop), domain ~NOK 200/year; managed hosting $28-35/month and up (Sage); real monthly cost NOK 550-1,850 incl. backup/security/premium plugins (Nokto).
- WordPress.com (monthly / yearly eq.): Free $0; Personal $9 / $4 ($2.75 on 3 years); Premium $18 / $8 ($5.50); Business $40 / $25 ($17.50); Commerce $70 / $45 ($31.50); Enterprise via WordPress VIP. Payment-block fee 10/8/4/2/0%.
- Elementor: free plugin; Pro Essential $60/yr (1 site), Advanced Solo $84, Advanced $108 (3 sites), Expert $204 (25 sites); Elementor One $180 first year then $228 (1 site, 25,000 AI/service credits); One Agency $432 then $540 (unlimited). Divi: $89/yr unlimited sites or $249 lifetime; Divi Pro $277/yr.
- Norwegian build costs (agency pricing, not platform): simple site NOK 10,000-30,000; business site NOK 30,000-100,000; webshop NOK 50,000-200,000+; running costs NOK 1,000-10,000/month — [Ledra, 2026-03-16](https://ledra.no/nettsider/pris)

Wix — [eSEOspace, 2026-10-05](https://eseospace.com/blog/wix-plans-compared), [Wix, 2026-07-29](https://wix.com/blog/how-much-is-a-wix-website)
- Free; Light $17; Core $29 (first plan that accepts payments); Business $39 (some pages show $36); Business Elite $159 (all yearly-billing monthly equivalents, paid up front); Enterprise on quote. Wix Studio (separate, not interchangeable): Basic $19; Standard $27; Plus $34; Elite $159; Enterprise custom. Domain renewal .com $13.35/yr. NOK pricing not found.

Squarespace — [PetaPixel, 2026-07-17](https://petapixel.com/2026/07/17/squarespace-is-increasing-prices-by-up-to-26), [SquareLocator, 2026-10-08](https://squarelocator.com/blogs/insights/is-squarespace-good-for-ecommerce)
- Yearly billing (monthly equivalent): Basic $19; Core $29; Plus $49; Advanced $99. Monthly billing: $25 / $39 / $65 / $139. Store transaction fee 2% on Basic, 0% above; card rate 2.9%+30c / 2.9% / 2.7% / 2.5%; courses/memberships fee 7/5/1/0%. 14-day trial, no free plan. (Pre-July 2026 prices were $16/$23/$39/$99.)

Webflow — [Octoagency, 2026-10-25](https://octoagency.io/blog/webflow-statistics), [JustPricing, 2026-09-06](https://justpricing.com/webflow-pricing)
- Site plans (yearly / monthly): Starter free; Basic $15 / $25 (no CMS, 300 pages); Premium $25 / $39 (20,000 CMS items; 50 GB bandwidth, add-ons to 2.5 TB); Team $2,500/month annual contract; Enterprise custom. Workspace: Starter free; Core $19 / $28; Growth $49 / $60; Freelancer $16; Agency $35; extra full seat $39, limited seat $15. Ecommerce: Standard $29 (500 items, 2% fee); Plus $74 (5,000 items, 0%); Advanced $212 (15,000 items, 0%). Add-ons: Localize from $9, Optimize from $299.

Framer — [Devgraphiq (price check 20 Oct 2026)](https://devgraphiq.com/framer-statistics), [Usagepricing, 2026-08-11](https://usagepricing.com/blueprint/framer)
- Free ($0); Basic $10 (30 pages, 1,000 CMS items per Oct page); Pro $30 (150 pages, 2,500 CMS items, 100 GB); Enterprise custom; editors $20 (full) / $10 (content-only); monthly billing roughly 50% higher (Basic $15, Pro $45). A "Scale" $100 plan appears in some reviews but not on the 20 Oct 2026 pricing page per Devgraphiq (conflict).

Adobe Commerce / Magento — [MGT-Commerce, 2026-07-10](https://mgt-commerce.com/blog/adobe-commerce-cloud-alternatives)
- Magento Open Source free (hosting, dev, extensions extra). Adobe Commerce: no public list price; GMV-based; mid-market reported ~$40,000/year; enterprise six figures. See Q5 for project costs.

BigCommerce / Commerce.com — [Shero Commerce, 2026-06-12](https://sherocommerce.com/blogs/insights/bigcommerce-pricing-guide), [eSEOspace, 2026-10-01](https://eseospace.com/blog/shopify-vs-bigcommerce)
- Core $39 ($29 yearly), up to $30k trailing-12-month GMV; Growth $105 ($79), up to $100k; Scale $399 ($299), $33,333/month included then 0.9% overage; Performance from $1,499/month billed annually (auto-upgrade at $2M TTM GMV). Open Payment Provider fee 2% / 1% / 0.6% on non-embedded gateways. 15-day trial.

Hostinger — [WebHostTraining, 2026-07-15](https://webhosttraining.com/hostinger-ai-website-builder-review), [Vibecoding.app](https://vibecoding.app/blog/hostinger-horizons-review)
- AI Builder via hosting plans, 48-month prepay: Premium $2.99 ($143.52 up front, renews $10.99, regular $11.99); Unlimited $3.99 ($191.52, renews $16.99); Cloud Startup $7.99 ($383.52, renews $25.99). Prices localise by country; AI credits 5/15/15 one-time. Stores use separate Hostinger Ecommerce subscription (0% transaction fees advertised).

GoDaddy — [Litmus, 2026-06-27](https://litmustools.com/review/godaddy-airo), [WebBuilding.net, 2026-10-02](https://webbuilding.net/platforms/godaddy), [HostAdvice, 2026-08-30](https://hostadvice.com/hosting-company/godaddy-reviews/airo-pricing)
- Websites + Marketing (intro, annual prepay): Basic $9.99 (renews $16.99; month-to-month $16.99); Premium $14.99 (renews $29.99); Commerce $20.99 (renews $34.99; 2.7%+30c transaction fee); another source lists Commerce $16.99 and Commerce Plus $29.99 (conflict, plan lineup in flux). Airo AI Builder: Free (50 credits); Starter $9.99 yearly / $19.99 monthly (150 credits, 1 site, code download); Professional $24.99 / $49.99 (300 credits, 10 sites); Ultimate $99.99 / $199.99 (750 credits, 50 sites). Airo Plus $4.99/month annual ($59.88 first year, $95.88 renewal). Managed WordPress with Airo from $6.99-$14.99 first year, renewals $14.99-$26.99.

Square Online / Weebly — [eSEOspace, 2026-10-05](https://eseospace.com/blog/wix-vs-square-online), [TechnologyChecker, 2026-10-04](https://technologychecker.io/compare/wix-vs-weebly)
- Square (US, per location): Free $0 (3.3%+30c online); Plus $49 (2.9%+30c); Premium $149. Weebly (still sold in US): Free; Personal $13 yearly / $16 monthly; Professional $15 / $20; Performance $32 / $36. Weebly winding down in 67 countries (see Q2).

Ecwid (Lightspeed) — [YourNextStore, 2026-05-11](https://yournextstore.com/blog/ecwid-alternatives)
- Starter $5 (10 products; free plan ended); Venture $35 monthly / $29 yearly (100 products); Business $65 / $49 (2,500); Unlimited $149 / $119; 0% platform fee. Raised 2 Mar 2026 on upper tiers.

Jimdo — [AgentSite, 2026-10-01](https://agentsite.ai/blog/jimdo-pricing), [Softabase, 2026-03-25](https://softabase.com/software/website-builder/jimdo)
- Websites (12-month contract): Free; Start $11; Grow $17 (older sources $15-18); Unlimited $49.50 (older sources $39-45). Store plans Basic $18, Business $21, VIP $28. 0% platform transaction fee; ticket-only support.

Shopware — [Codemaker-S, 2026-08-09](https://codemaker-s.com/en/platform/shopware), [Qualimero, 2026-03-30](https://qualimero.com/en/blog/shopware-online-shop-2025-costs-setup-ai-consultation-guide)
- Community EUR 0 (self-hosted); Rise from EUR 600/month; Evolve from EUR 2,400/month; Beyond on request (one source: from ~EUR 6,500); GMV-based. Typical project build EUR 10,000-25,000 for Shopware 6 Rise setup (one comparison), Shopware 5 to 6 migration EUR 10,000-50,000.

### Inferences
- Shopify's NOK list prices (389/1,030/4,490) are set locally, not a mechanical conversion of the USD list; no exchange-rate comparison was computed here. Note that a Norwegian agency blog quotes the USD list at about NOK 430/1,150/4,400, i.e. roughly parity with NOK pricing.
- Norwegian low-end SaaS competitors (24Nettbutikk, Mystore from about NOK 400/month, Mystore NOK 1,299 in Shopify's own comparison table) occupy the same price band as Shopify Basic, so price alone will not differentiate; localisation (Vipps, Klarna, Bring, EHF, MVA, Fiken/Tripletex) and fee transparency are the levers.

### Gaps
- NOK prices for Wix, Squarespace, Webflow, Framer, BigCommerce, Hostinger, GoDaddy not retrieved (all quote USD on US pages; regional pricing differs).
- Mystore and 24Nettbutikk current price lists and market positions: only second-hand (Shopify's blog, agency blogs).
- Jimdo ownership/status in 2026 (an IONOS relationship was implied by a comparison site but not verified), and Jimdo/Ecwid/Shopware financials, were not found.
- Webflow price sources conflict between March 2026 third-party guides ($14/$23/$39 CMS-era plans) and the May 2026 restructure; the Oct 2026 list above reflects the newer sources.
