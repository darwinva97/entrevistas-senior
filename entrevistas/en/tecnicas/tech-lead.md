# 🧭 Technical interview · Tech Lead

> Mock interview for technical leadership roles. Read **the question only**, answer out loud. Format explained in [how these mocks work](../README.md).

A tech lead is assessed at the intersection of **technical decisions + delivery + people**. The most common trap is answering as if you were still the team's best programmer; that's no longer the job.

## What they assess

| Dimension | What they want | Red flag |
|---|---|---|
| **Technical** | Judgment, not absolute mastery | Being the only person who can touch critical code |
| **Delivery** | Predictability, prioritisation, risk management | "It slipped because the team underperformed" |
| **People** | Team growth, feedback, conflict | Treating people as assignable resources |
| **Alignment** | Translating business ↔ technical, both ways | Insulating the team from all context |

---

## Q1. How much code do you write as a tech lead?

**What they assess:** whether you understand the role change. It's a calibration question; there's no correct number.

**❌ What NOT to say**

> "I still write the most code on the team: I handle the critical parts because I know the system best."

**Why it's wrong:** you're describing a bottleneck and a continuity risk. If only one person touches the critical parts, the team doesn't grow, holidays are a problem, and your departure would be an incident. And if you write most of the code, you're not doing the job you're paid for: unblocking others.

**⚠️ Acceptable answer**

> "Less than before, maybe 30% of my time, combined with reviews, design and coordination. I try not to be on the critical path of any delivery."

**What it's missing:** *which* code you choose to write — that's what reveals judgment.

**✅ Ideal answer**

> "Less than half my time, and what matters isn't the amount but the selection. I write things that block nobody: prototypes to reduce uncertainty in a decision, internal tooling, the scaffolding of a new integration, production bug fixes when I'm on call. What I avoid is putting myself on the critical path of a delivery, because my calendar is full of interruptions and becoming a dependency slows the team down. I also force myself to keep real contact with the code — reviews and some changes of my own — because a technical leader who hasn't touched the system in a year starts deciding from an outdated map, and the team notices immediately. And for the critical parts I do the opposite of hoarding them: I pair with someone until at least two people can work on them."

**Why it works:** explains the selection criteria, avoids being blocking, keeps technical credibility, spreads knowledge.

**🔁 Likely follow-up:** *"What if the team is running out of time?"* → "I help, but first I check whether the problem is capacity or scope; jumping in to code under pressure is usually a patch that also removes my view of what caused the delay."

---

## Q2. Product wants a feature by Friday and your team says it needs two weeks. What do you do?

**What they assess:** negotiation and scope management. The most common situation in the role.

**❌ What NOT to say**

> "I tell the team we need to push and ship it Friday; we'll do overtime if we have to."

**Why it's wrong:** you sacrifice the team and quality to avoid an uncomfortable conversation. Overtime as a planning tool produces bugs, debt and attrition, and it works once: next time they estimate, the team pads defensively.

**⚠️ Acceptable answer**

> "I talk to product to understand the real urgency and look for a reduced scope we can deliver Friday, leaving the rest for later."

**What it's missing:** why the date exists, concrete options with costs, and what you do if they insist anyway.

**✅ Ideal answer**

> "I start by understanding the date, because not every Friday is equal: if there's a paid marketing campaign or a customer commitment, the problem is real and it changes my answer; if it's aspirational, there's room. Then I put options on the table instead of a yes or no: which subset delivers real value on Friday — often 20% of the feature covers 80% of the case — what can ship behind a flag to a small group, and what happens if we move the date by a week. Each option with its explicit cost, including the debt we take on if we cut quality, with a repayment date. And something I always do: I talk to product in their terms — risk and impact — not 'it's technically complex', which means nothing to them. If they still choose full scope on Friday, I make clear in writing what gets dropped — usually tests or safe rollback — and who owns that risk; and then I back it, without resentment."

**Why it works:** understands before negotiating, offers costed options, speaks product's language, records risk without drama.

**🔁 Likely follow-up:** *"What if your team still feels pressured?"* → "That's where my job is to absorb pressure, not transmit it: the team should receive the agreed scope, not the anxiety of the negotiation."

---

## Q3. A team member is underperforming compared to the rest. How do you handle it?

**What they assess:** whether you diagnose before judging, and how you speak about people.

**❌ What NOT to say**

> "I raise it with their manager to deal with it or move them to another team; I can't be dragging someone who doesn't perform."

**Why it's wrong:** you delegate the hard part of your job and label the person before investigating. And the word "dragging" reveals an attitude that weighs heavily in a leadership interview: if you speak that way about a colleague in front of a stranger, imagine inside the team.

**⚠️ Acceptable answer**

> "I speak with them privately to understand what's going on, give concrete feedback and agree an improvement plan with follow-up."

**What it's missing:** the possible causes — which are rarely "doesn't perform" — and what *you* change.

**✅ Ideal answer**

> "First I check whether the problem is real or my perception: I look for concrete facts — tasks dragging on, rework, quality — rather than a feeling, because perceptions get contaminated easily. Then I talk privately, and I start by asking rather than diagnosing, because in my experience the most frequent causes aren't ability: missing context, badly defined tasks, blockers they don't dare raise, something personal, or simply that we put them somewhere they have no experience and nobody supported them. Depending on what comes out, *I* change something: different allocation, pairing, more context, adjusted expectations. We agree concrete, observable goals with short, frequent check-ins, not a review in six months. And I'm honest: if after a reasonable time with real support it doesn't work, I say it clearly and escalate with their manager — with evidence, with the person informed at every step, and no surprises. What I don't do is let it drift: that's unfair to the team and above all to that person, who deserves to know where they stand."

**Why it works:** verifies, asks before concluding, owns their part, acts with timelines, and admits it sometimes doesn't work — without cruelty or avoidance.

**🔁 Likely follow-up:** *"What if the rest of the team complains?"* → "I listen and I don't share details of a private conversation. I can say I'm aware and working on it; the team's trust is lost either way if I do nothing, or if I tell them everything."

---

## Q4. Two people on your team are stuck arguing about a technical decision. What do you do?

**What they assess:** how you unblock without imposing and without letting the noise continue.

**❌ What NOT to say**

> "As tech lead, I decide and the discussion is over. Someone has to cut it short."

**Why it's wrong:** cutting is sometimes necessary, but as a *first* move it teaches the team that debate is pointless and that whoever has the title wins. From then on they stop bringing you problems and decisions happen behind your back — or not at all.

**⚠️ Acceptable answer**

> "I ask them to write down the pros and cons of each option, we hold a short meeting and decide on objective criteria."

**What it's missing:** agreeing the criteria first, and handling the emotional part, which is usually the real blocker.

**✅ Ideal answer**

> "The deadlock usually isn't a lack of arguments — it's that they're deciding against different criteria without realising. So the first thing is to agree what we're deciding against: operating cost, delivery time, reversibility, who will maintain it. With the criteria clear, many arguments resolve themselves. If it's still tied, I look at the cost of being wrong: if the decision is cheap to reverse, we pick one and move on, because the cost of continuing the debate already exceeds the cost of being wrong — and I say that explicitly. If it's expensive, we run a scoped experiment with a deadline and let the data decide. Only if none of that unblocks it do I decide, explain why, and own the outcome; and I make sure whoever didn't win knows their argument was understood, otherwise the debate continues in the hallways. One nuance I watch: if this keeps happening between the same two people, the problem probably isn't technical, and I have that conversation separately."

**Why it works:** attacks the root cause, uses reversibility as leverage, decides as a last resort, spots the interpersonal pattern.

**🔁 Likely follow-up:** *"What if the chosen option isn't the one you preferred?"* → "That happens often and it's healthy: if the agreed criteria favour the other, defending it is what gives the criteria credibility."

---

## Q5. Your team is accumulating technical debt and product won't stop to fix it. How do you manage it?

**What they assess:** whether you can sell reliability in business language.

**❌ What NOT to say**

> "We stop for two sprints to refactor; otherwise this becomes unmaintainable."

**Why it's wrong:** "stopping" is the proposal no product owner accepts, and it rarely works anyway: a large refactor with no delivered value for weeks is hard to justify, hard to review, and gets abandoned at the first urgency. Framing it as an ultimatum also burns the political capital you need next time.

**⚠️ Acceptable answer**

> "I negotiate a fixed share of capacity per sprint for technical debt, say 20%, and prioritise within it whatever slows us most."

**What it's missing:** the data justifying that share and the connection to what product wants to achieve.

**✅ Ideal answer**

> "I stop calling it technical debt when talking to product, because that label sounds like an engineering luxury. I translate it into what they care about: 'this module makes every change take twice as long', 'this caused three incidents this quarter, X team hours and affected customers'. That needs data, so I measure: delivery time per area, incidents per component, share of rework. With that, the conversation stops being opinion versus opinion. Then I don't ask to stop: I ask for a constant share of capacity and tie it to the roadmap, attacking first the debt sitting in the path of what product wants to deliver in the coming months — that justifies itself. And I prefer opportunistic refactoring inside normal work over separate cleanup projects, because it delivers value while improving. The only thing I escalate as a formal risk is what can take the system down or block a major delivery: that isn't debt, it's operational risk, and it's a different conversation."

**Why it works:** translates, measures, integrates with the roadmap, and separates debt from risk — a distinction very few people make.

**🔁 Likely follow-up:** *"And if they still say no?"* → "I record the risk with its estimated impact and move on; and when the incident happens I don't say 'I told you so' — I use that moment to reopen the conversation with fresh data."

---

## Q6. How do you grow the people on your team?

**What they assess:** whether team growth is a goal of yours or something that just happens.

**❌ What NOT to say**

> "I give them hard tasks and recommend courses; over time they gain experience."

**Why it's wrong:** it delegates development to luck. There's no diagnosis of what each person needs, no support, and no way to know whether it works. "Hard tasks" without support is the standard recipe for burning someone out and confirming their insecurities.

**⚠️ Acceptable answer**

> "I hold regular one-on-ones, we talk about their goals, and I assign challenging work with reviews and frequent feedback."

**What it's missing:** specifics on how the challenge is chosen and how the person is supported.

**✅ Ideal answer**

> "I start by finding out where each person wants to go, which doesn't always match what I'd assume: some want technical depth, some want to lead, and some are fine where they are and need stability — all legitimate answers. With that I allocate work deliberately, not just by availability: I use real work as the vehicle — leading a feature end to end, being the contact point with another team, taking an accompanied on-call shift, presenting a decision — always with a safety net: someone to pair with, review, and explicit permission to get it wrong. Feedback I give early and concretely, both the good and the improvable, and in the one-on-one we also discuss what *I* could do differently. Two things I watch especially: that visible work is shared — if the same person always presents, I'm deciding who gets promoted without noticing — and that growth is visible outside the team, otherwise it stays a private conversation that translates into nothing."

**Why it works:** asks before assuming, uses real work as the vehicle, includes a safety net, and mentions equity in visibility — a mature-leader detail.

**🔁 Likely follow-up:** *"What if someone grows and then leaves?"* → "That's the normal outcome of doing it well. I'd rather have a team where people grow and sometimes leave than one where nobody grows and everyone stays; the second shows up in quality very quickly."

---

## Q7. You're on call and there's a serious incident. As the lead, what do you do?

**What they assess:** behaviour under pressure, and whether you know your role changes during an incident.

**❌ What NOT to say**

> "I start debugging myself, since I know the system best, and post updates in the chat as I go."

**Why it's wrong:** you become investigator and communicator at once, and both degrade: you lose the technical thread every time an executive asks a question, and external communication ends up half-done. Nobody is coordinating either, so two people may touch the same thing or make simultaneous changes that make it impossible to know what worked.

**⚠️ Acceptable answer**

> "I coordinate: assign who investigates what, keep stakeholders informed, and prevent uncontrolled changes."

**What it's missing:** prioritising mitigation over understanding, and caring for people during and after.

**✅ Ideal answer**

> "I take the coordinator role and step away from the keyboard, even though that's what I'd most like to do. First, scope the impact and choose the fastest available mitigation — roll back, kill with a flag, degrade — because mitigating and diagnosing are different things, in that order. Then I split the work: one person investigating by hypothesis, another preparing the rollback, and me communicating outwards with regular updates even when there's no news, because silence generates more noise than bad news. I impose one simple rule: one change at a time, announced, so we know what worked. I make sure evidence is captured before anything is cleaned up, and that whoever has been at it for hours gets relieved. Afterwards, two things: a blameless postmortem focused on which guardrail was missing, and a conversation with whoever was at the controls, because the person whose change triggered it usually takes it hard and needs to hear from me that the failure was the system's for allowing it, not theirs."

**Why it works:** consciously switches roles, prioritises mitigation, structures the work, communicates, and closes by caring for people.

**🔁 Likely follow-up:** *"What if the investigator is going down the wrong path?"* → "I give them a time box and ask what would rule each hypothesis out; if there's no progress in 15 minutes we change approach, without it being a judgment on them."

📚 [Course 08 · Incident playbook](../../../cursos/08-system-design/05-guion-de-incidentes.md)

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Role** | Did I answer as a leader or as the team's best programmer? |
| **Data** | Did I use numbers to negotiate and prioritise? |
| **People** | Did I speak about colleagues with respect and no labels? |
| **My part** | Did I own what *I* would change, not only others? |
| **Business** | Did I translate technical into impact and risk? |
