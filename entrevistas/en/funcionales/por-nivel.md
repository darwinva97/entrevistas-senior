# 📊 Behavioral interview · The same questions, scored by level

> A behavioral interview doesn't change much between a junior and a staff engineer. **What changes is the bar.** Here you'll see the same question with what's expected at each level, so you can calibrate to the role you're aiming for.

## How each level is calibrated

| Level | Expected scope in your answers |
|---|---|
| **Junior** | You and your task: you learn, you ask, you deliver |
| **Mid** | You and your team: you solve alone, you help, you anticipate |
| **Senior** | Your team and the product: you decide with trade-offs and own the consequences |
| **Staff / Lead** | Several teams and the organisation: influence without authority, changing systems |

General rule: **if your stories are only about code, you're answering one level below the one you think.**

---

## Q1. Tell me about yourself

**What they assess:** whether you can prioritise information and connect to the role. The most underrated question of all.

**❌ What NOT to say**

> "I was born in… I studied… my first job was… then three years at… after that I moved to… and now I'm at…"

**Why it's wrong:** a full chronological walk that takes five minutes, forces the interviewer to filter for you, and never says why you fit. Starting with university after eight years of work says you don't know what's relevant.

**⚠️ Acceptable answer**

> "I'm a developer with six years of experience, mostly backend with Java and Spring. I'm now at a logistics company working on microservices, and I'm looking for a new challenge where I can keep growing."

**What it's missing:** the hook. It's correct and forgettable: no concrete achievement, no connection to *this* role.

**✅ Ideal answer — by level**

*Mid:*
> "Backend, four years, mostly Node and Postgres. What I do best is take an ambiguous feature and carry it end to end: in my current team I owned the billing module, from API design to monitoring. I'm here because your product runs at a volume I haven't handled yet, and that's exactly what I want next."

*Senior:*
> "Eight years in backend, the last four in high-traffic distributed systems. My strength is reliability: at my current company I led the redesign of the payments flow — we went from two incidents a month to none in the last six months, and halved p99 latency along the way. This role interests me because you're in the scaling phase, and that's the problem I enjoy most."

*Staff / Lead:*
> "Eight years as an engineer and three leading teams of five to eight people. What I bring is architectural judgment plus getting decisions actually executed: my last project was migrating the order core with no downtime, coordinating three teams, and the measurable impact was cutting time-to-production for a change from three weeks to two days. This role appeals to me because it's that mix — not just designing, but supporting the execution."

**Why it works:** 60–90 seconds, one achievement with a number, and a close that connects to the role. Note how the scope of the example rises with the level — that's exactly what's being calibrated.

**🔁 Likely follow-up:** *"Why are you leaving your current company?"* → Where you're going, never what you're fleeing: "I've learned a lot there, and now I'm after a scale/product/leadership problem that doesn't exist for me there."

---

## Q2. Tell me about a mistake you made

**What they assess:** real self-criticism and ability to learn — and, with level, how much you own.

**❌ What NOT to say**

> "My biggest flaw is that I'm too much of a perfectionist and I get too involved in projects."

**Why it's wrong:** it's the textbook answer every interviewer has heard hundreds of times. It signals you don't want to expose yourself, and from then on they read your other answers more sceptically. A "mistake" that's really a disguised virtue is worse than not answering.

**⚠️ Acceptable answer**

> "I once pushed a change to production without testing it properly and broke a feature. I learned to test better before deploying."

**What it's missing:** impact, what you did at the time, and what changed durably. As written, the lesson is a cliché.

**✅ Ideal answer — by level**

*Junior / mid:*
> "I deployed a change to the notifications service without checking its effect on old templates, and about 500 emails went out with the wrong name. I found out through support tickets, raised it immediately, we reverted in 20 minutes and drafted the apology with support. What I changed: I wrote a test covering the legacy templates, and since then my pre-deploy routine explicitly includes asking which *existing* users a change affects, not only whether the new thing works."

*Senior:*
> "I decided to add a cache to cut latency without designing invalidation properly. Latency did drop, but for two weeks some users saw stale prices — and worse, we were slow to detect it because we had no freshness metric. I owned it in the postmortem: it was my decision and I skipped design review because it looked simple. We fixed it with event-based invalidation and a data-age metric with an alert. What changed in me is that now, when I introduce something that 'looks simple', I force myself to write down how I'll detect it failing before I implement it."

*Staff / Lead:*
> "I pushed a migration to an event-driven architecture the team wasn't ready to operate. Technically defensible, organisationally a mistake: it took months to stabilise and two important deliveries slipped. Admitting it in front of the team was uncomfortable but necessary, and we partially reverted. What I learned wasn't about the technology: it was that an architecture decision the team can't sustain is a bad decision, however good it looks on paper. Since then, any new infrastructure has to pass two filters: which number it improves, and who will operate it at 3 a.m."

**Why it works:** real impact, undiluted ownership, a concrete correction, and a durable change of criteria. Notice the mistake grows in scope with level — that's what's being assessed.

**🔁 Likely follow-up:** *"How did your team react?"* → Tell the real conversation, without heroics. Owning a mistake in front of the team is what gives the rest credibility.

---

## Q3. Tell me about a technical disagreement you had

**What they assess:** how you argue — with reasons or with ego — and whether you can concede.

**❌ What NOT to say**

> "A colleague insisted on a technology that clearly didn't work. In the end time proved me right and we had to redo it my way."

**Why it's wrong:** you present yourself as the winner of a war, not as a collaborator. "Clearly" dismisses the other view without arguing it, and "time proved me right" sounds like a grudge. The interviewer wonders what it's like to disagree with *you*.

**⚠️ Acceptable answer**

> "We argued about relational versus NoSQL. We laid out pros and cons, discussed it with the team, and went with relational, which was my proposal."

**What it's missing:** how the disagreement was resolved (the process, not the outcome) and what you learned from the other person.

**✅ Ideal answer — by level**

*Mid:*
> "I wanted to introduce an ORM and a colleague preferred hand-written SQL. We were arguing in the abstract, so I proposed something concrete: we implemented the same case both ways in a couple of hours and looked at it with the team. His concerns about complex queries turned out to be real, and we ended up with a mixed approach: ORM for simple things, SQL for reports. My takeaway is that arguing with code on the table takes twenty minutes, and arguing with opinions takes weeks."

*Senior:*
> "An architect wanted to introduce a service mesh and I thought the operational cost wasn't worth it at our size. Instead of debating principles, we agreed on the problem we wanted to solve — mTLS and uniform observability — and which alternatives covered it. It turned out we covered 80% with shared libraries and a simple proxy. He was right about the problem and I was right about the cost, and the decision was to postpone the mesh with an agreed trigger: past a certain number of services, we revisit. Working against a shared criterion rather than against the other person is what unblocked it."

*Staff / Lead:*
> "Leadership wanted a full rewrite of a system and I was against it. My initial mistake was arguing only with technical risk, which moved them not at all. I changed strategy: I brought data — where delivery time actually went, how many incidents came from which module — and proposed an incremental alternative with visible milestones every six weeks. That got approved. And I kept a lesson: when someone asks for a rewrite, they're rarely asking for new technology, they're asking to stop feeling pain; if you give them a credible way for the pain to drop soon, the conversation changes."

**Why it works:** there's a process, recognition of the other side's valid point, and a transferable lesson. The outcome matters less than how you got there.

**🔁 Likely follow-up:** *"Have you ever conceded on something you still believed you were right about?"* → Have this one ready: conceding gracefully and committing fully to someone else's decision is a very strong maturity signal.

---

## Q4. How do you prioritise when there's more work than fits?

**What they assess:** judgment and communication — and, by level, whether you prioritise your tasks or the team's.

**❌ What NOT to say**

> "I work extra hours if needed; I always get everything done."

**Why it's wrong:** that isn't prioritising, it's refusing to prioritise. It also signals you'll accept any load without negotiating, which guarantees you'll be assigned more than fits indefinitely, ending in poor quality or burnout.

**⚠️ Acceptable answer**

> "I prioritise by urgency and importance, talk to my manager if there's a conflict, and flag early if something won't make it."

**What it's missing:** the concrete criterion — what makes something important — and what happens to what gets dropped.

**✅ Ideal answer — by level**

*Junior / mid:*
> "I order by user impact and by whether I'm blocking someone: anything with a person waiting goes first, even if it's small. Then things with a real external deadline. And I flag early: if on Thursday I can see Friday won't happen, I say it on Thursday, not Friday afternoon. What doesn't fit I make explicit on the board so it isn't lost and whoever prioritises can see it."

*Senior:*
> "With two questions: what happens if we don't do it, and what breaks if we do it badly. That separates urgent from noisy. I prioritise what unblocks others and what reduces risk over what adds features, and I negotiate scope rather than deadline when I can, because cutting scope is reversible and cutting quality isn't. What doesn't fit I say explicitly, with consequences: 'this can wait and the cost is X'; leaving things in silent limbo is what breaks trust."

*Staff / Lead:*
> "At my level prioritising is mostly deciding what we *don't* do, and that has to happen with whoever holds business context, not alone. I use impact versus effort but add a third axis: reversibility, because expensive-to-undo work deserves more analysis. And I protect steady capacity for reliability and for team growth, because if those compete sprint by sprint against features, they always lose. When I have to say no, I offer alternatives and the cost of each; a 'no' with no options is a fight, a 'no, but' is a negotiation."

**Why it works:** explicit criteria, proactive communication, and — at higher levels — protecting capacity and deciding what not to do.

**🔁 Likely follow-up:** *"What if your manager says everything is a priority?"* → "I ask them to choose the order with the consequences visible: 'if we do A first, B slips two weeks; is that okay?'. That usually unblocks it, because nobody wants to decide in the abstract but everyone can choose between two concrete options."

---

## Q5. What do you do when you don't know something?

**What they assess:** autonomy and honesty. Sounds innocent, discriminates a lot.

**❌ What NOT to say**

> "I search online or ask an AI and solve it; honestly I rarely get stuck."

**Why it's wrong:** the last sentence does the damage: it suggests you don't separate solving from understanding, and that you copy solutions without judgment. And in a senior role, "I rarely get stuck" means you're not working on hard problems.

**⚠️ Acceptable answer**

> "I research on my own — docs, source code — and if I'm not making progress after a while, I ask someone on the team so I don't lose the day."

**What it's missing:** the criterion for when to stop and what you do so it doesn't recur.

**✅ Ideal answer**

> "I time-box the solo research — an hour, two at most, depending on urgency — because a silent three-day block is the worst possible outcome for everyone. In that time I go to the source: official docs and, if needed, the library's code, which usually answers faster than searching around. When I ask, I arrive with work done: what I'm trying to achieve, what I tried, what I expected, what happened; that turns a 30-minute interruption into a 5-minute one. And if it's something I'll need again or someone else will hit, I write it down. In interviews and at work I apply the same rule: I'd rather say 'I don't know, here's how I'd find out' than invent, because invention gets detected and costs you credibility on everything else."

**Why it works:** time-boxing, going to the source, asking with context, documenting, and explicit honesty.

**🔁 Likely follow-up:** *"What if nobody on the team knows either?"* → "Then I scope it and test it: a small experiment with a clear hypothesis. And if it still doesn't work, I surface it early as a risk instead of burning a week in silence."

---

## Q6. Where do you see yourself in three years?

**What they assess:** whether your trajectory fits what the company can offer. There's no right answer, only coherent ones.

**❌ What NOT to say**

> "Honestly, I'd like to start my own company." *(or)* "In your job." *(or)* "I don't know, I don't plan that far ahead."

**Why it's wrong:** the first announces you're leaving; the second is a joke that rarely lands; the third signals a lack of direction exactly when you're being assessed for an autonomous role. You can hold any of those goals — the problem is stating them without connecting to what you'd contribute meanwhile.

**⚠️ Acceptable answer**

> "I'd like to keep growing technically and reach a senior or leadership role, depending on how things evolve."

**What it's missing:** specificity and connection to the company. It fits any vacancy, which is why it adds nothing.

**✅ Ideal answer**

> "With more scope than I have today: moving from owning my area to having my decisions affect several teams, whether through the technical track or by leading. What I'm clear about is the direction: high-traffic systems and reliability decisions, because that's where I enjoy myself most and where most of my scars are. That's why your context appeals to me specifically. And I'd ask you the same in reverse: what does the path look like for someone joining in this role? I'd rather know now, because if what you offer is purely a management track and I want technical depth, better to find out today than in a year."

**Why it works:** gives direction without closing doors, connects it to the company, and turns the question around — showing you're evaluating too.

**🔁 Likely follow-up:** *"What if there's no promotion available short-term?"* → "It depends on whether there's real growth in scope even if the title doesn't change; the title matters less to me than the problem. But if in two years the job would be identical, that would be a factor."

---

## Checklist before a behavioral interview

- [ ] I have **six STAR stories**, each with an impact number and my role clear.
- [ ] Each story has a **30-second** and a **2-minute** version.
- [ ] My "tell me about yourself" runs **90 seconds** and ends connecting to this role.
- [ ] I have a **failure** story that genuinely takes responsibility.
- [ ] I have a **disagreement** story where I conceded, not only where I won.
- [ ] I know **why this company**, with something concrete about their product or engineering.
- [ ] I have **five questions** for them, at least one uncomfortable (on-call, attrition, debt).
- [ ] I will not speak badly about anyone, no matter what.
