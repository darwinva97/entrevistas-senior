# 🎨 Technical interview · Frontend

> Mock interview by level. Read **the question only**, answer out loud and on a timer. Format explained in [how these mocks work](../README.md).

## What they assess at each level

| Level | What they want | What rules you out |
|---|---|---|
| **Junior** | Platform fundamentals (not just the framework), semantics and CSS | Knowing React but not the DOM |
| **Mid** | State, perceived performance, accessibility, testing | Optimising without measuring |
| **Senior** | UI architecture, data, real-user metrics, product judgment | Talking only about trendy libraries |
| **Staff** | Design systems, frontend platform, organisational cost | Ignoring the team and the business |

---

## Junior level

### Q1. What's the difference between `localStorage`, `sessionStorage` and cookies?

**What they assess:** whether you know the platform or only the framework — and whether you think about security.

**❌ What NOT to say**

> "They're the same thing, but `localStorage` holds more and never expires. I keep the user's token there."

**Why it's wrong:** the second sentence sinks you. A token in `localStorage` is readable by **any** script on the page, so a single XSS — or one compromised dependency — hands over the session. That's a security decision, not a convenience one, and saying it casually means nobody has ever reviewed that code.

**⚠️ Acceptable answer**

> "`localStorage` persists until cleared, `sessionStorage` lives as long as the tab, and cookies are sent to the server on every request and can have an expiry."

**What it's missing:** the implications. Textbook-correct, but it doesn't say when to use each, and never mentions `HttpOnly`.

**✅ Ideal answer**

> "Functionally it's scope and lifetime: `localStorage` persists across sessions, `sessionStorage` dies with the tab, and cookies travel to the server on every same-origin request. But the difference that weighs most is security: the first two are readable from JavaScript, so I keep nothing sensitive there. For sessions I prefer an `HttpOnly; Secure; SameSite` cookie, because XSS can't read it. I use `localStorage` for UI preferences like theme or language, and `sessionStorage` for temporary state in a long form."

**Why it works:** defines, decides and justifies with a security criterion. From a junior, bringing up `HttpOnly` unprompted stands out a lot.

**🔁 Likely follow-up:** *"If the cookie is `HttpOnly`, are you safe?"* → "From XSS theft, yes — not from CSRF. That needs `SameSite` and, depending on the case, an anti-CSRF token."

📚 [Course 06 · AuthN and authZ](../../../cursos/06-seguridad/02-authn-authz.md)

---

### Q2. Why does React ask for a `key` when rendering lists?

**What they assess:** whether you understand reconciliation or just repeat the console warning.

**❌ What NOT to say**

> "Because React wants it to avoid the console warning. I usually pass the array index."

**Why it's wrong:** index keys cause real, hard-to-see bugs: when you insert, delete or reorder, React reuses the wrong node and internal state — a half-typed input, a checked box — stays on the wrong row. Treating it as "silencing a warning" says you don't know what the algorithm does.

**⚠️ Acceptable answer**

> "The `key` lets React identify each element across renders and know which ones changed, so it doesn't recreate the whole list. It should be a unique, stable identifier like an id."

**What it's missing:** why the index fails — which is the actual question behind it.

**✅ Ideal answer**

> "Because reconciliation diffs the new tree against the previous one and needs to know which element is which. Without a stable key, React matches by position: if I insert an item at the top, it thinks every item changed content instead of one being new. That's not just inefficient — it causes state bugs, because component and DOM state (focus, input text) stays tied to the position rather than the data. So I use the domain id; the index is only acceptable in lists that never reorder or change size, and even then I'd rather not build the habit."

**Why it works:** explains the mechanism *and* the observable symptom, which is what proves you've hit it.

**🔁 Likely follow-up:** *"What about `Math.random()` as a key?"* → "Worse: it changes every render, so React unmounts and remounts everything, you lose state and focus, and performance gets worse."

---

## Mid level

### Q3. The app is slow while typing in a large form. What do you do?

**What they assess:** whether you measure or apply optimisations by reflex.

**❌ What NOT to say**

> "I wrap everything in `React.memo`, `useMemo` and `useCallback`. That always improves performance."

**Why it's wrong:** memoisation isn't free: every `useMemo` adds dependency comparison and memory, and applied blindly it usually makes things worse and clutters the code. And if the cause is a state change high in the tree re-rendering everything, `memo` without fixing the origin fixes nothing. "Always improves" is the word that gives you away.

**⚠️ Acceptable answer**

> "I'd profile with React DevTools to see which components re-render, and memoise the expensive ones — or move the state closer to the input."

**What it's missing:** the hierarchy of fixes (state architecture before memoisation) and the difference between "renders often" and "renders expensively".

**✅ Ideal answer**

> "First I profile to find out whether I'm rendering too often or a single render is expensive — different problems. In forms it's usually the first: the input state lives too high, so every keystroke re-renders half the tree. The cheap fix is to move the state as close to the field as possible, or use uncontrolled inputs with a form library that only subscribes what changes. If there genuinely is an expensive component — a table with thousands of rows, a chart — then I memoise, or virtualise the list. And I measure before and after, because if I can't demonstrate the improvement I haven't made one."

**Why it works:** orders fixes by cost, separates the two causes, and demands evidence.

**🔁 Likely follow-up:** *"When would you reach for `useMemo` without hesitating?"* → "When the computation is genuinely expensive and its dependencies rarely change, or when the value is passed to a memoised child and I need referential identity."

---

### Q4. How do you handle loading and error states when fetching data?

**What they assess:** product maturity. A simple question where nearly everyone falls short.

**❌ What NOT to say**

> "I set a `loading` flag with a spinner and, if it fails, an `alert` with the error."

**Why it's wrong:** it ignores the states that actually exist (empty, partial, revalidating, offline), doesn't separate errors the user can fix from system failures, and an `alert` blocks the UI while telling the user nothing actionable. It also says nothing about retries or out-of-order responses.

**⚠️ Acceptable answer**

> "Three states: loading, error and data. I use something like TanStack Query for caching, retries and revalidation, and show an error message with a retry button."

**What it's missing:** the empty state, accessibility of state changes, and which message you show per error type.

**✅ Ideal answer**

> "I model the states explicitly, and there are more than three: initial loading, has data, revalidating in the background, empty, recoverable error and system error. The empty state is always forgotten and it's the worst experience if it shows an infinite spinner. I use a data library — TanStack Query or similar — because it gives me caching, deduplication and backoff retries without writing them, and it avoids the classic out-of-order response bug. On errors I distinguish: a 4xx the user can fix gets shown on the relevant field; a 5xx gets a neutral message, a retry button and a log entry with the trace id so we can chase it. And I announce state changes to screen readers with an `aria-live` region, because otherwise, for someone who can't see the spinner, the app simply stops responding."

**Why it works:** real states, no wheel reinvention, and accessibility woven in naturally — which almost nobody does.

**🔁 Likely follow-up:** *"Do you always retry automatically?"* → "Only idempotent requests. A `POST` that creates an order I don't silently retry; I offer the button and, if the backend supports it, send an idempotency key."

---

## Senior level

### Q5. Business says the site "feels slow", but the backend responds in 80 ms. How do you approach it?

**What they assess:** whether you know perceived performance isn't server response time.

**❌ What NOT to say**

> "I run Lighthouse and do whatever it says: compress images, lazy-load, push the score to 90."

**Why it's wrong:** Lighthouse is a synthetic measurement on a machine and network that aren't your users'. Optimising the score may not move real experience at all, and sometimes optimises exactly what users don't feel. The score is a proxy, not the goal.

**⚠️ Acceptable answer**

> "I'd measure with Lighthouse and field data (Core Web Vitals) and target LCP and INP, which drive perception the most."

**What it's missing:** segmentation. Averages hide the problem — it's probably slow on one device, region or screen.

**✅ Ideal answer**

> "I start by turning 'feels slow' into something measurable: which screen, which devices, which network, which percentile. I use real-user data, not just lab, because p75 LCP on a mid-range phone on 4G outside the capital looks nothing like my laptop on fibre. The problem is almost always segmented. Then I find where the time goes: LCP is usually a request waterfall or a huge image; INP is JavaScript blocking the main thread; CLS is late-arriving elements with no reserved space. And I count total page time, not backend time: 80 ms of server with five chained network hops, TLS and a bundle is two seconds for the user. I close with a performance budget in CI, because this gets fixed once and breaks every sprint."

**Why it works:** challenges the premise, segments, knows what causes each metric, ends with prevention.

**🔁 Likely follow-up:** *"What if it's only slow in South America and the server is in Virginia?"* → "Then it's network latency: CDN for static assets, and if the HTML is dynamic, edge rendering or cached with revalidation. Every intercontinental round-trip is ~150 ms multiplied by the number of chained requests."

📚 [Course 00 · Latency and queues](../../../cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

---

### Q6. How do you choose between client-side, server-side and static rendering?

**What they assess:** architectural judgment, not preferences.

**❌ What NOT to say**

> "Always SSR, it's better for SEO and first paint."

**Why it's wrong:** "always" disqualifies any architecture answer. SSR adds a server to operate, per-request cost, cache complexity and hydration — and for an admin panel behind a login it contributes exactly zero SEO.

**⚠️ Acceptable answer**

> "It depends: SSG for content that rarely changes, SSR when I need SEO and fresh data, CSR for internal or highly interactive apps."

**What it's missing:** the cost of each option and the mixes, which is what real products use.

**✅ Ideal answer**

> "Three questions: does a search engine need to index it, how stale can the content be, and who pays the cost — the server or the user's device? Public content that changes rarely: static with revalidation, fastest and cheapest to operate. Public content that is personalised or very fresh: SSR, accepting that I now have a server with latency, caching and capacity to size. An app behind login with heavy interaction: client-side, since SEO doesn't apply and I skip the complexity. In practice it's a mix per route: static landing, catalogue with revalidation, dashboard on the client. And I don't forget the part that usually hurts: hydration, which is where INP goes in many SSR sites."

**Why it works:** reproducible criteria, operational cost, and the hydration trap.

**🔁 Likely follow-up:** *"What about islands or server components?"* → "They target exactly that: ship HTML and only the JavaScript for what's interactive. I gain INP and weight; I pay with a more complex mental model and fewer people on the team who know it."

---

## Staff / principal level

### Q7. Five teams share one web app and block each other. What do you propose?

**What they assess:** whether you diagnose the organisational problem before proposing technology.

**❌ What NOT to say**

> "Micro-frontends with Module Federation: each team deploys its own and the blocking is over."

**Why it's wrong:** it jumps to the most expensive solution with no diagnosis, and ignores that micro-frontends move the problem elsewhere: duplicated dependencies, visual consistency, cross-boundary debugging, and a platform someone must maintain. Without mature CI/CD and a design system you get every cost and none of the benefits.

**⚠️ Acceptable answer**

> "I'd evaluate micro-frontends, but first check whether a monorepo with well-separated packages and `CODEOWNERS` solves it more cheaply."

**What it's missing:** the data behind the decision and the order of moves.

**✅ Ideal answer**

> "First I measure the actual blocking: deploys per week per team, time spent waiting for coordination, build time, how many conflicts come from touching the same code. Without those numbers the discussion is ideological. Often the blocking isn't technical but procedural — a weekly release train or a shared manual QA. If so, fixing the process takes weeks and touches no architecture. If the blocking is real and structural — teams own different domains and still collide — then yes, I'd propose runtime separation, but with three preconditions: a versioned design system, an explicit contract between shell and remotes, and independent deploys with per-version rollback. And I say it plainly: if we don't meet those conditions, micro-frontends will hurt more than the problem they solve."

**Why it works:** measures, separates process from architecture, and sets entry conditions. That "if we don't meet these, we don't do it" is what marks a staff engineer.

**🔁 Likely follow-up:** *"What if leadership already decided on micro-frontends?"* → "Then my job is to make it work: I negotiate the minimum conditions, start with one domain as a pilot, and measure whether it actually reduces delivery time before rolling it out."

📚 [Course 05 · Micro-frontends](../../../cursos/05-microfrontends/)

---

### Q8. How do you guarantee accessibility in a large product without slowing the team down?

**What they assess:** whether accessibility is a process for you or a last-minute task.

**❌ What NOT to say**

> "We run an audit before each big release and fix whatever it finds."

**Why it's wrong:** it turns accessibility into debt paid at the end, when structural changes are expensive. And a one-off audit catches a low percentage of real problems (automation can't see lost focus, tab order, or a useless alt text).

**⚠️ Acceptable answer**

> "I'd add automated checks in CI with axe and train the team on the basics: contrast, form labels, keyboard navigation."

**What it's missing:** that automation covers little, and that the real lever is the design system.

**✅ Ideal answer**

> "I move it from a task to a property of the system. The biggest lever is the design system: if the form field component already ships an associated label, visible focus states and announced error messages, the team does the right thing by default without thinking. On top I add automated checks in CI, knowing they only catch part — contrast, missing attributes — and the rest needs human review. I add one cheap step to the definition of done: navigate the feature with the keyboard only, which finds most serious issues in two minutes. And once a quarter, a screen-reader pass over the critical flows. What I don't do is leave it for a final audit: by then it isn't a CSS tweak, it's restructuring."

**Why it works:** attacks the root, acknowledges the limits of automation, proposes a cheap high-return ritual.

**🔁 Likely follow-up:** *"How do you justify it to the business?"* → "As market reach and legal risk, not goodwill: there are users who can't buy today, and several countries regulate it. It also improves SEO and general usability."

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Platform** | Did I talk about the browser and the user, or only the framework? |
| **Measurement** | Did I say how I'd measure before optimising? |
| **Real users** | Did I segment by device, network or region? |
| **Accessibility** | Did it come up without being asked? |
| **Brevity** | Under 90 seconds per answer? |
