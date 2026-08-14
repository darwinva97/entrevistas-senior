# 🧪 Technical interview · QA / Test automation

> Mock interview by level. Read **the question only**, answer out loud and on a timer. Format explained in [how these mocks work](../README.md).

## What they assess at each level

| Level | What they want | What rules you out |
|---|---|---|
| **Junior** | Case-design judgment, curiosity, clear bug reports | "Testing" with no strategy; reports with no repro steps |
| **Mid** | Maintainable automation, the right level per test, test data | Automating everything through the UI |
| **Senior** | Quality strategy, risk, flakiness, quality in the process | Being the bottleneck at the end of the sprint |
| **Staff / QA Lead** | Quality owned by the team, metrics, quality in production | Measuring by number of test cases executed |

---

## Junior level

### Q1. You're given an "age" field in a form. What test cases do you design?

**What they assess:** case-design technique. The most common question, and the one most people answer by intuition.

**❌ What NOT to say**

> "I'd try 18, 30 and 50 to see if it works, and also letters."

**Why it's wrong:** those are examples, not technique. Three valid values from the same class give you the same information as one, and they miss the boundaries, which is where bugs live. The interviewer expects *equivalence classes* and *boundary values*, even if you don't use those words.

**⚠️ Acceptable answer**

> "Equivalence classes and boundary values: a valid value, one below the minimum, one above the maximum, the exact limits, empty, letters and symbols."

**What it's missing:** the questions you ask first (what are the business rules?) and the non-obvious cases: negatives, decimals, whitespace, unicode, extreme length — and what happens on the backend if someone bypasses the browser.

**✅ Ideal answer**

> "Before writing cases I ask for the rules: allowed range, is it required, what happens with a minor in this flow. Then equivalence classes and boundaries: if the range is 18–120, I test 17, 18, 19, 119, 120, 121 and a middle value. I add format cases: empty, whitespace, letters, decimals, negatives, a huge number, unicode. And above all I test **on the backend**, bypassing the form with a direct request, because client validation is UX and server validation is what protects the data. Finally the state cases: what gets stored, what shows after a reload, and whether the error message tells the user how to fix it."

**Why it works:** asks before testing, applies named technique, and jumps to the backend where the real risk is.

**🔁 Likely follow-up:** *"How many of those would you automate?"* → "The validation ones, at unit or API level — fast and stable. Through the UI I'd keep only one or two happy paths."

---

### Q2. You find a bug. How do you report it?

**What they assess:** communication. A badly reported bug costs hours of back and forth.

**❌ What NOT to say**

> "I open a ticket with a screenshot and message the developer that checkout is broken."

**Why it's wrong:** "it's broken" isn't information. With no steps, environment, data used, expected vs actual, or technical evidence, the developer spends their time reproducing it — or worse, closes it as "cannot reproduce".

**⚠️ Acceptable answer**

> "I write the title, repro steps, expected and actual result, the environment, and attach a screenshot or video."

**What it's missing:** severity vs priority, scope (how many users? always or intermittent?) and technical evidence that speeds up diagnosis.

**✅ Ideal answer**

> "With the minimum for someone else to reproduce it without asking me anything: a title describing the effect, numbered steps with the exact data I used, expected vs actual, environment and version, and evidence. I add two things that save a lot of time: scope — always or one in ten, which browsers, only certain account types — and technical evidence: the network request and response, the console error, and the trace id if we have one, because that takes the developer straight to the log. And I separate severity from priority: it can be a severe failure on a screen three people use monthly, and that conversation belongs to product, not to me alone."

**Why it works:** thinks about the receiver, reduces diagnosis time, and distinguishes severity from priority.

**🔁 Likely follow-up:** *"What if you can't reproduce it?"* → "I report it anyway, flagged as intermittent, with all the evidence and observed frequency, and I look for correlation: user, data, time, version. Intermittent bugs are usually concurrency or accumulated state."

---

## Mid level

### Q3. What do you automate, and at which level?

**What they assess:** whether you know the maintenance cost of each test type.

**❌ What NOT to say**

> "I automate all regression cases with Selenium or Cypress to get full UI coverage."

**Why it's wrong:** that's the ice-cream-cone recipe: a slow, expensive, flaky suite that eventually gets disabled. UI tests are the slowest, break on cosmetic changes and localise causes worst. "Full UI coverage" is a promise that never survives a year of product work.

**⚠️ Acceptable answer**

> "I follow the test pyramid: many unit tests, some integration, few end-to-end, automating through the UI only the critical flows."

**What it's missing:** the criterion for *which* flows, and the API level — where the return is highest.

**✅ Ideal answer**

> "I automate by risk and maintenance cost, not by coverage. Most of the value sits at API level: fast, stable and it tests the actual logic, so that's where validations, permissions and edge cases go. Through the UI I keep only journeys that make money or block the user: signup, login, purchase. As a rule, a UI test has to justify its existence; if a case can be covered one level down, that's where it goes. I also automate things that aren't functional but break silently: contracts between services, basic accessibility, some performance checks. And manual testing doesn't disappear — I reserve it for exploratory work, which is where I find the bugs nobody wrote a case for."

**Why it works:** decides by risk and cost, puts weight on API, defends exploratory testing, mentions contract testing.

**🔁 Likely follow-up:** *"How do you choose the critical flows?"* → "With data: usage analytics, revenue per flow, incident history. And I validate it with product and support, who know what hurts when it breaks."

---

### Q4. You have tests that fail intermittently. What do you do?

**What they assess:** flakiness — *the* senior QA problem, and many treat it as an annoyance.

**❌ What NOT to say**

> "I add automatic retries, and if one fails a lot I mark it as skipped so it doesn't block the pipeline."

**Why it's wrong:** the retry hides the symptom and sometimes hides a real concurrency bug in the product, not the test. A skipped test is a dead test that gives false coverage. Worse is the cultural effect: the team learns to ignore red, and the day red is real nobody looks.

**⚠️ Acceptable answer**

> "I investigate the cause: usually fixed waits, execution-order dependencies or shared data. I replace `sleep` with condition-based waits and isolate the data."

**What it's missing:** the surrounding process (quarantine with an owner and a date) and the possibility that the flakiness is the product's.

**✅ Ideal answer**

> "I treat flakiness as a high-priority bug, because its real cost is that the team stops trusting the suite. First I measure: which tests fail, how often, since when — without that ranking it gets fixed by perception. The typical causes are four: fixed waits instead of condition waits, order or shared-data dependencies, an unstable environment, and — the important one — a real race condition in the product, in which case the test is doing its job and the code needs investigating. While it's being fixed: quarantine with an owner and a date, not an indefinite skip, and visible on a dashboard so it isn't forgotten. Retries I allow only as a temporary safety net, with a metric, never as the fix — a silent retry is a way of lying about quality."

**Why it works:** measures, classifies causes, considers a real bug, and proposes a process with an owner.

**🔁 Likely follow-up:** *"What's a reasonable target?"* → "Under 1% of runs failing due to flakiness, and any test with more than X intermittent failures per week auto-quarantined."

---

## Senior level

### Q5. A critical bug reached production through your QA process. What do you do?

**What they assess:** quality culture — and whether you look for culprits or barriers.

**❌ What NOT to say**

> "That case wasn't in the test plan, so we didn't cover it. We'd need more complete requirements."

**Why it's wrong:** it's a defence, not an analysis. Even if the requirements were incomplete, the answer shifts responsibility and offers no improvement. A senior role is expected to own the whole system, not their box.

**⚠️ Acceptable answer**

> "I analyse how it escaped, add the case to the automated regression suite and check for similar uncovered cases."

**What it's missing:** the other barriers that failed. Adding the case prevents *that* bug, not the class of bug.

**✅ Ideal answer**

> "I treat it as a failure of the quality system, not of a person. First containment with the team: what's the impact, do we roll back or kill it with a flag. Then the analysis: not only why testing missed it, but why *nothing* caught it. Usually several barriers failed — no case, no validation in the code, no alert that would have made it obvious in production. And a question I find more important than the first: how long did it take us to find out? If a customer reported it, my problem isn't only testing, it's observability. Three actions come out of that: the specific case automated at the cheapest level, a barrier covering the whole family — a validation, a contract, a type — and an alert that catches the symptom in production. And I write it with no names, because if the postmortem hunts for culprits, the next bug reaches me late and through rumours."

**Why it works:** contains, analyses the whole system, asks about detection time, and produces three different kinds of action.

**🔁 Likely follow-up:** *"How do you stop the suite growing forever, one case per bug?"* → "By adding at the cheapest level and reviewing periodically: cases that haven't failed in two years over stable code are candidates for deletion. A suite is code and it has debt too."

---

### Q6. The team wants to deploy daily and your regression cycle takes two days. What do you propose?

**What they assess:** whether you know QA can't be a gate at the end.

**❌ What NOT to say**

> "Then we can't deploy daily: we need the regression time to guarantee quality."

**Why it's wrong:** it makes QA the company's official brake, and it starts from a false premise — that quality comes from a long cycle at the end. It's also the answer that gets QA bypassed entirely.

**⚠️ Acceptable answer**

> "I'd automate the regression to cut the time, and keep only the essential manual checks before each deploy."

**What it's missing:** the model change. Automating the same inverted pyramid just makes the gate slightly faster.

**✅ Ideal answer**

> "I change the model: quality stops being a phase and gets distributed. In the per-change pipeline only fast, stable things run — unit, API, contracts and a handful of critical journeys — with a clear target, say ten minutes. The slow but valuable work moves off the critical path: nightly or in parallel, and what it finds becomes a bug, not a deploy blocker. And I lean on production: with feature flags and canary releases I can ship to 5% of users and watch metrics, which reduces risk far more than an extra day of manual testing. In exchange I ask for two things: fast rollback and decent observability, because without them moving quality towards production is reckless. And I keep exploratory testing, but on what's new, not repeating regression a machine does better."

**Why it works:** proposes a complete model (shift-left and shift-right), sets numeric targets, and negotiates conditions instead of blocking.

**🔁 Likely follow-up:** *"What if there are no feature flags or observability?"* → "Then that's the prerequisite investment, and I say it with data: today our only safety net is two days of manual testing, which doesn't scale and doesn't catch what only shows up with real traffic."

---

## Staff / QA Lead level

### Q7. How do you measure the quality of a product?

**What they assess:** whether you measure QA activity or business outcomes.

**❌ What NOT to say**

> "Number of test cases executed, bugs found and code coverage percentage."

**Why it's wrong:** those are activity metrics, all gameable: more trivial cases, more cosmetic bugs, more coverage of getters. Worse, they incentivise the opposite of what you want — finding bugs late instead of preventing them.

**⚠️ Acceptable answer**

> "I'd look at bugs escaped to production, time to fix, and suite stability rather than number of cases."

**What it's missing:** the user's voice and the connection to the business.

**✅ Ideal answer**

> "With outcome metrics, not activity. The ones I use: incidents reaching users by severity, time to detect them — usually the most revealing number — deploy failure rate and recovery time, and the share of work spent on rework. On top, the user signal: support tickets per area, drop-off in critical flows, and client-side errors versus server-side ones. I also watch the health of the test system itself: pipeline duration and flakiness rate, because a slow, unstable suite degrades quality even when the dashboard is green. And I explicitly don't measure by number of cases or bugs found, because those reward finding late instead of preventing: if my work is going well, bugs found in QA should *drop* while escaped bugs drop too."

**Why it works:** outcome metrics, user voice, measures the process itself, and explains the rejection of easy metrics.

**🔁 Likely follow-up:** *"How do you justify investment in quality to leadership?"* → "In time and money: rework, incident hours, sales lost in the broken flow. 'Each failed deploy costs us X team hours and Y orders' persuades far more than a coverage percentage."

---

### Q8. How do you make quality everyone's responsibility instead of QA's?

**What they assess:** influence without authority — the leadership question of the role.

**❌ What NOT to say**

> "By setting a policy: no ticket moves to done without QA approval."

**Why it's wrong:** it reinforces the opposite. If QA is the final stamp, the team delegates quality to QA and stops thinking about it while coding. It also makes you a bottleneck and the organisation's "no".

**⚠️ Acceptable answer**

> "By involving QA from refinement, training the team, and encouraging developers to write their own tests."

**What it's missing:** how you achieve that in practice, and what changes in the rituals.

**✅ Ideal answer**

> "Three moves. First, get in earlier: at refinement, while the design can still change, asking the uncomfortable questions — what if this fails halfway, what does the user see, how will we know in production. An hour there is worth a week of testing later. Second, give tools instead of verdicts: easy environments and test data, helpers to write API tests without suffering, and copy-pasteable examples; people do the right thing when it's the easiest thing. Third, change the ritual: the definition of done includes automated tests and observability for the feature, and the demo also shows how it behaves when it fails. I stop being the gate and become the person who designs the strategy, runs exploratory testing and owns the metrics. It's uncomfortable at first because it feels like losing control — but the control was an illusion; what we had was a bottleneck."

**Why it works:** three concrete levers, changes rituals instead of imposing policy, and admits the uncomfortable part honestly.

**🔁 Likely follow-up:** *"What if developers don't want to write tests?"* → "Usually because writing tests there hurts: fragile environment, impossible data, slow suite. Fix that first and resistance drops; if it persists, make it visible with rework data, not reproaches."

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Technique** | Did I name case-design techniques or only give examples? |
| **Right level** | Did I put each test at the cheapest level that covers it? |
| **Risk** | Did I prioritise by user and business impact? |
| **Process** | Did I talk about prevention as well as detection? |
| **Non-blocking** | Did I offer alternatives instead of stopping delivery? |
