# 🧩 Technical interview · Fullstack

> Mock interview by level. Read **the question only**, answer out loud and on a timer. Format explained in [how these mocks work](../README.md).

In fullstack they rarely test maximum depth in each layer: they test **the seams**. Where validation lives, who owns state, how the contract between your frontend and backend evolves, and whether you know where your limits are.

## What they assess at each level

| Level | What they want | What rules you out |
|---|---|---|
| **Junior** | Understanding the full path of a request | Knowing half and bluffing the rest |
| **Mid** | End-to-end autonomy and judgment at the seams | Duplicating business logic in both layers |
| **Senior** | Contract design, perceived performance, production | "I know everything" with no demonstrable depth anywhere |
| **Staff** | Coherence of the whole product and the team | Ignoring the cost of maintaining two worlds |

---

## Junior level

### Q1. You type a URL and press Enter. What happens?

**What they assess:** the classic. Not exhaustiveness — knowing the path and where to go deep.

**❌ What NOT to say**

> "The browser makes a request to the server, the server returns HTML, and the page shows up."

**Why it's wrong:** not incorrect, just empty — it fits in one sentence and demonstrates nothing. For a question that exists precisely to see how far you can go, answering the minimum wastes it.

**⚠️ Acceptable answer**

> "DNS resolution, TCP connection, TLS handshake if HTTPS, HTTP request, server responds, browser parses the HTML, fetches resources and renders."

**What it's missing:** the layers that actually exist in production (cache, CDN, load balancer) and the rendering part, where frontend skill shows.

**✅ Ideal answer**

> "I'd tell it in three stretches and stop wherever you're interested. Resolution and connection: browser and OS caches, DNS, TCP, TLS handshake — round-trips that are very noticeable on mobile. Path to the origin: usually a CDN that may answer without reaching the server, and if it does reach it, a load balancer routing to an instance. And the browser part, which drives what the user perceives most: HTML parsing, DOM and CSSOM construction, resource fetching — where blocking scripts delay first paint — layout, paint, and hydration if it's a JavaScript app. Happy to go deeper on any of the three; the one that has caused me the most trouble in practice is the third."

**Why it works:** structured, mentions what really exists in production, and offers depth instead of reciting everything.

**🔁 Likely follow-up:** *"What would make that first render faster?"* → "Fewer round-trips: a CDN near the user, HTTP/2 or 3, non-blocking scripts, and sending useful HTML up front instead of an empty div filled by JavaScript."

---

### Q2. Where do you validate form data: frontend or backend?

**What they assess:** whether you understand the trust boundary. The quintessential fullstack question.

**❌ What NOT to say**

> "In the frontend, where the form is; that way the user sees errors immediately and we don't load the server."

**Why it's wrong:** the client is attacker territory. Anyone can bypass your form with `curl`, DevTools or their own client. Validating only on the client isn't an optimisation — it's not validating. Said confidently, this sinks a fullstack interview even if everything else goes well.

**⚠️ Acceptable answer**

> "Both: frontend for fast feedback, backend because that's where the data actually has to be guaranteed."

**What it's missing:** what exactly gets validated where, how to avoid duplicating rules, and business validation.

**✅ Ideal answer**

> "Both, with different purposes — and that's the point. On the client I validate for UX: format, required fields, immediate feedback. On the server I validate for security and integrity, because the client is attacker territory and anyone can send a direct request. To avoid maintaining two truths that drift apart, I share the schema: define the rules once — with Zod, for example — use them on both sides and derive the types from it. What I don't share is business validation: checking stock, permissions or credit limits only makes sense on the server, because it needs data the client doesn't have and shouldn't have. And error messages should be useful on the client and neutral externally: no internal details leaked."

**Why it works:** separates purpose, solves duplication concretely, and distinguishes format from business validation.

**🔁 Likely follow-up:** *"What if the database validates it too?"* → "Even better: a unique constraint or `CHECK` is the last safety net, the one that still works when two services write or a race condition happens."

---

## Mid level

### Q3. Your screen needs data from three endpoints and it's slow. What do you do?

**What they assess:** whether you see the whole problem or only your favourite layer.

**❌ What NOT to say**

> "I create a new endpoint returning everything at once, so it's a single request."

**Why it's wrong:** it may be the right answer, but giving it immediately skips diagnosis and creates an endpoint coupled to *that* screen — future debt. Also, if the three calls are already parallel and one takes 2 seconds, aggregating fixes nothing: the slowest one rules.

**⚠️ Acceptable answer**

> "I'd check whether the requests are sequential and parallelise them, and if it's still slow, consider an aggregated endpoint or caching what rarely changes."

**What it's missing:** measuring where the time goes, and progressive rendering — usually the biggest win without touching the backend.

**✅ Ideal answer**

> "First I find where the time goes: network, one slow call out of three, or rendering. In the network tab I check for a waterfall, the most common mistake: three chained requests because the second needs an id from the first. If they're independent, they go in parallel. If one is inherently slow, I split it out and render progressively: paint what I have and give that section its own skeleton, because perception improves even if total time doesn't change. An aggregated endpoint or a BFF is a good solution when fan-out is high or the client is mobile with poor latency — accepting that I now have an endpoint coupled to a screen that someone must maintain. And I cache what rarely changes: catalogues, configuration, profile."

**Why it works:** measures, separates waterfall from slowness, and brings up progressive rendering, which almost nobody mentions and moves perception the most.

**🔁 Likely follow-up:** *"Wouldn't GraphQL solve this?"* → "It solves over-fetching and fan-out, yes, but brings its own cost: harder HTTP caching, field-level authorisation, and expensive queries you must limit. For three endpoints I wouldn't justify it."

---

### Q4. How do you evolve the API without breaking the already-deployed frontend?

**What they assess:** whether you understand that frontend and backend deploy separately. The most important fullstack seam.

**❌ What NOT to say**

> "Since we're the same team and deploy together, I change the field in the backend and the frontend in the same PR."

**Why it's wrong:** it assumes atomicity that doesn't exist. Even deploying both at once, there are users with the previous frontend already loaded in their browser — and on mobile, the old app for weeks. That gap produces silent errors right after every deploy.

**⚠️ Acceptable answer**

> "I make compatible changes: add the new field without removing the old one, update the frontend, then remove the old one once nobody uses it."

**What it's missing:** how you know nobody uses it, and which seemingly-compatible changes aren't.

**✅ Ideal answer**

> "I start from the fact that the deployed frontend and the backend are two systems with independent versions, even within one team: there are always open tabs on the old version and, on mobile, old app versions for weeks. So I only make additive changes: add the new field, keep the old one, update the client, and only then retire. And I'm careful with changes that look innocent and aren't: adding a value to a response enum breaks any client with a `switch` and no default case; tightening a validation breaks requests that used to pass; and changing a field's meaning without changing its shape is the worst, because no test catches it. To know when I can retire something, I measure usage per client version; without that, retirement is an act of faith. And on the client I apply Postel's law: ignore unknown fields and have a default for values I don't understand."

**Why it works:** right premise, lists the treacherous changes, and requires measurement before removal.

**🔁 Likely follow-up:** *"How do you force users on an old app to update?"* → "A minimum supported version the backend communicates, warning in the app and a grace period; and if we must cut off, with an announced date, not overnight."

📚 [Course 07 · Versioning strategies](../../../cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

---

## Senior level

### Q5. Design a shopping cart that works for anonymous users and after login.

**What they assess:** state split between client and server, and the edge cases that appear when merging.

**❌ What NOT to say**

> "I keep it in `localStorage` while anonymous and, on login, upload it to the server replacing whatever was there."

**Why it's wrong:** "replacing" destroys the user's data without asking: three items saved on their account from their phone just vanish. And `localStorage` with no timestamp or validation accumulates stale prices and availability, showing a cart with products that no longer exist or three-month-old prices.

**⚠️ Acceptable answer**

> "Local cart while anonymous, and on login merge with the server's, summing quantities and revalidating prices and stock against the backend."

**What it's missing:** merge conflicts, expiry, and the source of truth for price and stock.

**✅ Ideal answer**

> "First I decide the source of truth per piece of data: cart contents can live on the client while anonymous, but price and availability always come from the server and are revalidated on display and again at checkout. The anonymous cart gets its own identifier and an expiry; with that timestamp I can ignore anything too old. On login I merge instead of replacing, and I define the conflicts explicitly: same product in both, keep the larger quantity rather than the sum, because summing usually surprises the user; product no longer available, show it flagged rather than silently removing it; price changed, tell them before payment. And I make all of it visible: a 'we merged your cart' message avoids the support ticket. The merge operation is idempotent, because a double click or a retry can't duplicate lines."

**Why it works:** decides source of truth per datum, defines conflict rules explicitly, and thinks about what the user sees.

**🔁 Likely follow-up:** *"What about two open tabs?"* → "Sync across tabs — storage event or a channel — and make the server the arbiter once there's a session; otherwise the user sees two different carts and understands nothing."

---

### Q6. Where do you put business logic in a fullstack app?

**What they assess:** architectural judgment and awareness of duplication cost.

**❌ What NOT to say**

> "In the frontend, so the app feels faster and we don't hit the server for everything."

**Why it's wrong:** any rule touching money, permissions or integrity that lives only on the client is a vulnerability, not an optimisation. And duplicating it guarantees the two copies disagree within six months.

**⚠️ Acceptable answer**

> "Business logic goes in the backend; the frontend presents and validates formats for fast feedback."

**What it's missing:** the real nuances, which is where the work actually is: computations the user must see instantly, and genuinely shared rules.

**✅ Ideal answer**

> "My rule: logic that decides something with consequences — final price, permissions, stock, discounts — lives on the server and is the single truth. The client may *anticipate* the result so the experience feels instant, but what gets confirmed is what the server says; if they differ, the server wins and I tell the user. When the rule is pure presentation — formatting, sorting, showing or hiding — it goes on the client without hesitation. And when a rule genuinely must be shared, I extract it to a common package with tests instead of reimplementing it twice: duplication doesn't fail on day one, it fails the day someone changes one and not the other, and that bug is expensive to find because each layer 'works fine'. In practice most of these conflicts disappear if the backend returns the computed result — the total, the effective permissions — instead of the ingredients for the client to compute."

**Why it works:** clear rule, accepts the optimistic-UX nuance, and offers the most elegant fix (return the result, not the ingredients).

**🔁 Likely follow-up:** *"What if the computation is expensive and requested a thousand times?"* → "Cache it on the server with a key covering what affects the result, and return the value with its version. Moving the computation to the client to save server CPU trades a cost problem for a correctness one."

---

### Q7. How do you answer when asked about the layer you know least?

**What they assess:** calibrated honesty. In fullstack this situation **always** arrives.

**❌ What NOT to say**

> "I know everything — backend, frontend, infrastructure, databases; no layer is a problem for me."

**Why it's wrong:** nobody believes it, and three follow-ups prove it false. Worse: once you're caught bluffing on one topic, the interviewer starts doubting everything you said before, including the true parts.

**⚠️ Acceptable answer**

> "I can handle both layers, though I'm more comfortable in backend; in frontend I've worked with React at application level."

**What it's missing:** turning the limitation into evidence of judgment — what you do when you hit your limit.

**✅ Ideal answer**

> "I'm stronger in backend and I say so openly: that's where I've debugged concurrency and data problems in production. In frontend I'm autonomous enough to build a full application — state, performance, basic accessibility — but I wouldn't design a large organisation's design system without support from a specialist. When I hit my limit I do two things: say it before it becomes a problem, and find someone who knows instead of improvising. In my last project I didn't fix a rendering performance issue by intuition: I measured, asked a colleague with more frontend experience to review, and learned in the process. I'd rather you know exactly where I stand in each layer than get a surprise in the first sprint."

**Why it works:** calibrates per layer, shows what they do at the limit, and closes with a business reason (no surprises). Honesty, told well, adds credibility.

**🔁 Likely follow-up:** *"What if the role needs more frontend than you have?"* → "Then I'd rather know now: I can cover it with support and I learn fast, but if you need someone leading frontend from day one, I'm not the profile — and saying that today saves us both three months."

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Seams** | Did I talk about the boundary between layers, not just each layer? |
| **Source of truth** | Did I say who owns each piece of data? |
| **Deployment** | Did I assume client and server deploy separately? |
| **Honesty** | Did I calibrate my level per layer without bluffing? |
| **User** | Did I mention what the user perceives, not just what the system does? |
