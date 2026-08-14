# 🏛️ Technical interview · Software architect

> Mock interview (senior → principal). Read **the question only**, answer out loud and on a timer. Format explained in [how these mocks work](../README.md).

Underneath every architecture question there is one thing being measured: **whether you decide with explicit criteria or with preferences**. The right answer is almost never a technology; it's reasoning with constraints, cost, and a way to find out you were wrong.

## What they assess

| Level | What they want | What rules you out |
|---|---|---|
| **Architect (senior)** | Trade-offs with data, designs that survive change | Recommending the fashionable architecture |
| **Principal / staff** | Technical strategy, migrations, governance without bureaucracy | Ivory tower: deciding without building or listening |

---

## Q1. When microservices and when a monolith?

**What they assess:** judgment versus dogma. It's the warm-up, and it already sets half your score.

**❌ What NOT to say**

> "Microservices, because they scale better, let you use the right technology per problem, and avoid the monolith, which always turns into a mess."

**Why it's wrong:** three slogans in a row. "Scale better" ignores that scalability is nearly always limited by the database, not the process; "right technology per problem" is an operational cost paid for years; and calling monoliths a mess confuses an architecture with a lack of discipline. It also proposes the highest-complexity option with zero constraints on the table.

**⚠️ Acceptable answer**

> "It depends on team size and domain. With a small team I'd start with a well-modularised monolith and extract services when we need to scale specific parts or when teams block each other."

**What it's missing:** measurable criteria and the concrete costs you take on by splitting.

**✅ Ideal answer**

> "I treat it as an organisational decision with technical consequences, not the other way round. I split out a service when there's a concrete reason: two teams blocking each other in the same release cycle, one part with a radically different scaling profile, or a compliance/data boundary worth isolating. If the reason is 'to scale', I ask for the number: in most systems the limit is the database, and splitting the process without splitting the data changes nothing. The cost I take on is explicit: network calls that fail, eventual consistency, coordinated deploys if the contract isn't well designed, and infrastructure someone has to operate at 3 a.m. So my default starting point is a modular monolith with real internal boundaries — modules with owners, no cross-access to another module's tables — because that lets me extract a service when the reason appears, and saves paying the complexity before I need it."

**Why it works:** explicit criteria, asks for data, names concrete costs, keeps both doors open.

**🔁 Likely follow-up:** *"What if leadership already decided on microservices?"* → "Then I define domain boundaries and data ownership first, because the expensive mistake isn't having microservices — it's having a distributed monolith where several services write the same tables."

📚 [Course 08 · Pattern catalogue](../../../cursos/08-system-design/03-catalogo-de-patrones.md)

---

## Q2. Design the integration between a legacy ERP and a new commerce platform.

**What they assess:** integrating with systems you don't control — 80% of real architecture work.

**❌ What NOT to say**

> "I connect the platform directly to the ERP database to read stock and prices, avoiding middlemen."

**Why it's wrong:** coupling to the internal schema of a system you don't control is the worst possible decision: any ERP update breaks you, there's no contract, no access control, and you're probably putting transactional load on a database that wasn't sized for your traffic. Fast to build, brutally expensive to maintain.

**⚠️ Acceptable answer**

> "I'd put an integration layer with my own API in front of the ERP, and sync data with scheduled jobs or events, with retries and monitoring."

**What it's missing:** direction of flow per data item, the staleness the business will accept, and what happens when the ERP is down or slow.

**✅ Ideal answer**

> "First I agree with the business on the question that drives the design: how stale can each piece of data be. Price and stock don't tolerate the same staleness as a product description. Then I decide direction and ownership per datum: the ERP owns stock and price, the platform owns orders and customers, and neither writes in the other's territory. In between I put an anti-corruption layer: an integration service translating the ERP's model into mine, so its vocabulary and its changes don't leak into my whole system. Transport depends on what the ERP supports: if it publishes events or I can read its change log, great; if it only has an API or files, a sync process with a watermark and reprocessing. I assume and design for two things: the ERP will go down and get slow — so cached data with TTL, explicit degradation, and never in the checkout critical path if I can help it — and there will be discrepancies, so periodic reconciliation with a dashboard. And if the ERP can't handle my traffic, I keep a read replica of what I need, with its staleness documented."

**Why it works:** starts from the business requirement, defines data ownership, names the anti-corruption pattern, designs for the other system's failure.

**🔁 Likely follow-up:** *"The ERP takes 4 seconds to answer stock queries. What do you do?"* → "I don't call it in real time while browsing: I serve cached stock with its age visible, and validate against the ERP only at order confirmation, with a timeout and a defined behaviour if it doesn't answer."

---

## Q3. How do you justify an architecture decision to the business?

**What they assess:** whether you can translate. An architect who only convinces engineers isn't an architect.

**❌ What NOT to say**

> "I explain the technical benefits: decoupling, scalability, maintainability. If they don't get it, it's because they're not technical."

**Why it's wrong:** it blames the listener. Those three words mean nothing to whoever controls the budget, and the last sentence reveals an attitude that's disqualifying in an influence role: making it understood *is* your job.

**⚠️ Acceptable answer**

> "I translate it into business impact: delivery time, outage risk, cost. And I present options with pros and cons so they can decide informed."

**What it's missing:** the concrete format and recording the decision, which is what makes it sustainable.

**✅ Ideal answer**

> "I present three things: options, consequences and a recommendation. Never a single option, because that isn't a decision, it's an announcement; and never three without a recommendation, because that pushes my job onto them. Consequences go in their language: time to value in production, risk — 'if this fails, checkout goes down and that's X orders per hour' — infrastructure and people cost, and which doors it closes. That last point is what they value most once they get it: a reversible decision can be made quickly, an irreversible one deserves two weeks of analysis. And I write it down as a one-page ADR with context, alternatives and decision, because in two years someone will ask why this is like this, and 'we don't know' is what causes unnecessary rewrites. When I can, I also propose a scoped experiment instead of a bet: two weeks of prototype produce more information than two weeks of meetings."

**Why it works:** concrete format, translation to risk and money, reversibility as a criterion, ADR and experiment.

**🔁 Likely follow-up:** *"What when the business decides against your recommendation?"* → "I record the risk we're accepting and make the decision revisitable with a trigger: 'if X happens in three months, we revisit'. And then I back it properly, because a decision executed half-heartedly out of resentment is worse than either option."

---

## Q4. The company wants to rewrite the system from scratch. What do you say?

**What they assess:** maturity. A classic trap, and highly discriminating.

**❌ What NOT to say**

> "Great — with modern technology we'll do it much better and faster; six months and we'll have the new version."

**Why it's wrong:** full rewrites are the industry's best-documented failure mode, and the six-month estimate ignores that the old system contains years of unwritten business rules — edge cases, integrations, patches from past incidents — that nobody remembers until they're missing. Plus you must maintain both during the rewrite while the business keeps asking for changes.

**⚠️ Acceptable answer**

> "I'd recommend an incremental migration with the strangler fig pattern instead of a big-bang rewrite, to reduce risk."

**What it's missing:** understanding *why* they're asking for a rewrite, which is almost never what they say.

**✅ Ideal answer**

> "First I ask what problem they want to solve, because 'rewrite' is a solution, not a problem. If the pain is that a feature takes three months, or weekly incidents, or nobody understands the code, each leads to a different plan and none necessarily requires starting over. What I know for sure is that the old system holds years of business rules written down nowhere, discovered in production when they're missing. So I propose incremental migration: identify the boundaries, put a routing layer in front, and move one domain at a time, starting with one that has real value and bounded risk. I compare old and new results in the shadow before switching traffic, because that gives me evidence instead of faith. And I'm explicit about the cost: during the migration we maintain two systems, and that must be budgeted. If they still decide to rewrite, my minimum condition is doing it in phases with the old system in production and no shutdown date until the new one demonstrates measured — not perceived — parity."

**Why it works:** challenges the premise, names the real risk, gives the mechanism (shadow comparison), and sets a minimum condition when overruled.

**🔁 Likely follow-up:** *"What if the old technology is unsupported and nobody knows it?"* → "That does change the calculation, because the risk becomes security and staffing. Even so, I migrate in phases: isolate the riskiest part first, not everything at once."

📚 [Course 07 · Zero-downtime migrations](../../../cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md)

---

## Q5. How do you set technical standards without slowing teams down?

**What they assess:** technical governance. Here you find out whether you're an enabler or an obstacle.

**❌ What NOT to say**

> "I create an architecture committee that reviews and approves every design before implementation."

**Why it's wrong:** a pre-approval committee is a queue: the bigger the company, the longer the wait, and the predictable result is teams learning to route around it or ask forgiveness instead of permission. It also concentrates knowledge in a group that doesn't live with the consequences.

**⚠️ Acceptable answer**

> "I'd define documented guidelines and best practices, and take part in design reviews for significant changes without blocking day-to-day work."

**What it's missing:** how you achieve actual adoption, which is the real problem with any standard.

**✅ Ideal answer**

> "With three tools and no committee. First: make the right thing the easy thing. A service template that already ships observability, security, a pipeline and reversible deploys drives more adoption than any document, because the recommended path is also the comfortable one. Second: automate whatever is checkable — linting, cluster policies, dependency scanning, breaking-change detection — so the standard is enforced by a machine in the pull request, not by a person in a meeting. Third: write decisions as ADRs with context, so they can be challenged with data instead of authority. I take part in designing what carries high risk or crosses teams, but early, while things can still change — not as a final approver. And something I consider essential: I keep writing code, even a little, because a standard whose author doesn't live with it becomes a tax others pay."

**Why it works:** turns standards into a product, automates instead of policing, and closes with a strong credibility signal.

**🔁 Likely follow-up:** *"What if a team wants to deviate?"* → "I ask why; sometimes the standard is wrong or doesn't cover their case, and that's information. If the reason is solid, we document the exception with an owner; what I don't allow is a silent exception."

---

## Q6. Tell me about an architecture decision of yours that went badly.

**What they assess:** honesty and learning. It's where most people get defensive and come off worst.

**❌ What NOT to say**

> "Honestly, none come to mind; the decisions I made worked out. There were problems sometimes, but from things outside my control."

**Why it's wrong:** either you haven't made important decisions, or you haven't followed their consequences, or you're not being honest. All three readings are bad — and the "outside my control" coda confirms the worst one.

**⚠️ Acceptable answer**

> "We once chose a technology that didn't fit the team and we had to change it. I learned to consider the team's context more before deciding."

**What it's missing:** specifics, measured impact, and what changed in how you decide — not just the conclusion.

**✅ Ideal answer**

> "Yes: I introduced an event-driven architecture in a domain that didn't need it. The argument was decoupling, and on paper it was right, but the team was five people, the flow was mostly synchronous, and nobody had experience operating a broker. What happened was that debugging got slow — following an operation across five topics without mature tracing is miserable — and duplicates appeared because the first consumers weren't idempotent. It took months to stabilise and several features shipped late. We partially reverted: we kept events where there genuinely was decoupling between domains and went back to synchronous calls where the flow was one business transaction. What changed in me wasn't 'don't use events' — it's that now I require two things before introducing new infrastructure: a measurable reason, meaning which number improves, and an honest check of whether the team can operate it the day it fails at 3 a.m. And I prefer reversible decisions, proven in one domain before extending them."

**Why it works:** specific, admits real impact, describes the correction, and — crucially — explains what changed in the *criteria*, not just the outcome.

**🔁 Likely follow-up:** *"How did you notice it was going badly?"* → "Too late, and that was a lesson too: now I pair big decisions with a couple of indicators and an explicit review date, so I don't depend on someone daring to say it isn't working."

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Constraints** | Did I ask for requirements and limits before designing? |
| **Explicit cost** | Did I state what each decision costs? |
| **Reversibility** | Did I separate expensive-to-undo decisions from cheap ones? |
| **Evidence** | Did I propose how to find out I was wrong? |
| **People** | Did I consider the team that will operate and maintain it? |
