# 🛠️ Technical interview · DevOps / SRE

> Mock interview by level. Read **the question only**, answer out loud and on a timer. Format explained in [how these mocks work](../README.md).

## What they assess at each level

| Level | What they want | What rules you out |
|---|---|---|
| **Junior** | Real Linux, networking and Git; scripting; operational curiosity | Knowing `kubectl apply` without knowing what happens underneath |
| **Mid** | CI/CD, containers, IaC, methodical diagnosis | Changing things in production by hand |
| **Senior / SRE** | Measurable reliability, incidents, capacity, cost | Talking tools instead of SLOs |
| **Staff** | Platform as a product, team autonomy, risk | Becoming everyone's deployment bottleneck |

---

## Junior level

### Q1. A server is responding slowly. You have SSH. What do you look at?

**What they assess:** whether you have a diagnostic method or you guess.

**❌ What NOT to say**

> "I restart the service, and if that doesn't work, the machine."

**Why it's wrong:** you destroy the evidence before collecting any, so if it comes back you have nothing to diagnose with. "Restart" as a first reflex also says you don't separate mitigating from understanding: sometimes restarting is right, but you decide that *after* capturing state.

**⚠️ Acceptable answer**

> "CPU and memory with `top`, disk with `df -h`, and the service logs with `journalctl`."

**What it's missing:** the four dimensions (CPU, memory, disk, network) and, above all, saturation — the queue of pending work, which warns earlier than utilisation.

**✅ Ideal answer**

> "I go resource by resource, following utilisation, saturation and errors. CPU: `top` or `mpstat`, also looking at load average against core count and `%iowait`, because 20% CPU with high iowait means we're waiting on disk, not computing. Memory: `free -m`, whether swap is active and whether the kernel OOM-killed something (`dmesg | grep -i oom`). Disk: `df -h` and `df -i` — exhausted inodes give bizarre errors with free space — plus `iostat`. Network: `ss -s` for connection states, and lots of `CLOSE-WAIT` tells me the application isn't closing sockets. In parallel, the highest-yield question: what changed, because nearly everything starts with a deploy, a config change or data that grew. And I capture evidence before touching anything."

**Why it works:** covers all four dimensions, includes details only someone who has debugged knows (iowait, inodes, CLOSE-WAIT), and prioritises "what changed".

**🔁 Likely follow-up:** *"CPU at 100% in one process — now what?"* → "Identify the process and thread (`top -H`), see what it's doing with a profiler or a stack dump, and check whether it lines up with a deploy or a load change."

---

### Q2. What's the difference between an image and a container, and why does it matter?

**What they assess:** container fundamentals beyond copying a Dockerfile.

**❌ What NOT to say**

> "A container is like a lightweight virtual machine with its own operating system."

**Why it's wrong:** it's the misunderstanding that causes real errors. A container **shares the host kernel**: it doesn't boot an OS, it's an isolated process with namespaces and cgroups. Believing it's a VM leads to expecting security isolation that isn't there, not understanding why `limits.memory` kills the process, and shoving `systemd` into an image.

**⚠️ Acceptable answer**

> "The image is an immutable layered template; the container is a running instance of it with a writable layer on top."

**What it's missing:** the mechanism (namespaces, cgroups) and the practical consequences.

**✅ Ideal answer**

> "The image is an immutable artifact — read-only layers identified by digest; the container is a host process running with that image mounted, isolated with namespaces (PID, network, mounts) and constrained with cgroups. The important consequence is the shared kernel: it isn't as strong a security boundary as a VM, which is why non-root users, dropping capabilities and not mounting the Docker socket matter. And layers explain two everyday things: why instruction order in the Dockerfile changes build time, and why a secret written in one layer is still there even if you delete it in the next. That's why I reference images by digest, not tag: tags are mutable and don't guarantee I deploy what I tested."

**Why it works:** mechanism, security, and two verifiable practical consequences.

**🔁 Likely follow-up:** *"Why does a process inside the container see all the host RAM?"* → "Because many tools read the host `/proc`; the limit lives in the cgroup. That's why runtimes must be configured with the container limit, or the GC sizes itself wrong and you get OOMKills."

📚 [Course 04 · Compute, containers and serverless](../../../cursos/04-cloud-y-kubernetes/02-computo-contenedores-y-serverless.md)

---

## Mid level

### Q3. A pod is in `CrashLoopBackOff`. How do you diagnose it?

**What they assess:** whether you can read Kubernetes or only apply manifests.

**❌ What NOT to say**

> "I delete the pod so it gets recreated, and if it persists I scale the deployment."

**Why it's wrong:** `CrashLoopBackOff` means the container **starts and dies** repeatedly: recreating it reproduces the same failure and scaling multiplies it. You also lose the previous container's logs, which is exactly where the answer is.

**⚠️ Acceptable answer**

> "I check `kubectl logs` and `kubectl describe` for events."

**What it's missing:** `--previous` (logs of the container that died), the exit code, and the list of typical causes.

**✅ Ideal answer**

> "`kubectl describe pod` first, because the events and `Last State` give me the exit code: 137 is OOMKilled and points to memory; 1 with the app starting is config or a dependency; 127 is a missing command. Then `kubectl logs --previous`, the part people forget: the current container may not have written anything, and what I need are the logs of the one that died. The causes I check, in order: a missing env var or secret, a dependency unavailable at startup, filesystem permissions when running as non-root, a memory limit too low for the runtime, and misconfigured probes — a liveness probe with no `startupProbe` kills apps that boot slowly. If I need to look inside, `kubectl debug` with an ephemeral container instead of changing the image."

**Why it works:** orders the tools, uses exit codes as discriminators, lists concrete causes.

**🔁 Likely follow-up:** *"And if the pod is `Pending`?"* → "Different problem: it isn't failing, it couldn't be scheduled. I read the scheduler events: insufficient resources, taints without tolerations, impossible affinities, or an unbound PVC."

📚 [Course 04 · Kubernetes](../../../cursos/04-cloud-y-kubernetes/04-kubernetes.md)

---

### Q4. Every deploy produces 502s for a few seconds. Why, and how do you fix it?

**What they assess:** whether you understand the pod lifecycle. This separates people who have operated from people who have read.

**❌ What NOT to say**

> "That's normal in a rolling update, it's only a few seconds. We can deploy at night so it doesn't affect anyone."

**Why it's wrong:** it normalises an avoidable failure. A properly done rolling update loses zero requests, and "deploy at night" means giving up on deploying whenever you need to — the opposite of what this role is for.

**⚠️ Acceptable answer**

> "Probes aren't configured properly: with a correct readiness probe Kubernetes won't send traffic until the pod is ready, and `maxUnavailable: 0` keeps capacity."

**What it's missing:** the main cause of 502s isn't the pod coming in — it's the one going out.

**✅ Ideal answer**

> "There are two halves. The incoming pod is fixed with a proper readiness probe and `maxUnavailable: 0`. The outgoing pod causes most of the 502s and is subtler: when a pod is deleted, Kubernetes sends `SIGTERM` and removes the endpoint **in parallel**, and propagation to kube-proxy and the ingress takes time; during that window traffic still arrives at a process that is already shutting down. So I need two things together: a `preStop` hook that waits a few seconds — or flipping readiness to red and waiting — to let traffic drain, and a graceful shutdown in the app that stops accepting new connections, finishes in-flight ones, closes consumers and pools, and only then exits. And `terminationGracePeriodSeconds` has to exceed that whole sum or `SIGKILL` cuts you in half. The way to prove it is to measure: constant load, `rollout restart`, count errors until it's zero."

**Why it works:** identifies the real cause, gives both required pieces, ends with empirical verification.

**🔁 Likely follow-up:** *"What about WebSockets?"* → "Graceful shutdown isn't enough there: you need to tell the client to reconnect, because `Shutdown` doesn't close hijacked connections. Usually a progressive close plus jittered reconnection so you don't cause a stampede."

---

## Senior / SRE level

### Q5. How do you define a service's SLOs, and what do you do with them?

**What they assess:** whether reliability is measurable to you or a feeling.

**❌ What NOT to say**

> "We set 99.99% availability, which is the industry standard."

**Why it's wrong:** there's no standard, there's cost. Each nine multiplies investment and complexity, and your SLO can't exceed the product of your dependencies'. Promising 99.99% without analysing the business or the dependencies is a promise someone will break.

**⚠️ Acceptable answer**

> "I define an SLI representing user experience — say, percentage of requests without error and under 300 ms — set a monthly target and alert on deviations."

**What it's missing:** the error budget as a decision tool, and burn-rate alerting.

**✅ Ideal answer**

> "I start from the user, not the infrastructure: an SLI that represents their experience, usually availability and latency of the critical journey, measured as close to the client as possible. The target I negotiate with the business with a concrete question: what does a minute of downtime cost, because that's where 99.9% versus more comes from. And I check it against dependencies: if my payment provider offers 99.9%, promising more on a flow that depends on them is a lie. The important part comes next: the error budget becomes a decision tool, not a pretty dashboard. If we have budget left, we can take risks and ship fast; if we've burnt it, features freeze and we work on reliability — and that's agreed *before* the incident, not argued during it. Alerts go on budget burn rate: a fast burn pages someone, a slow one opens a ticket. That's how you end the 'CPU at 90%' alerts nobody knows how to act on."

**Why it works:** connects to the business and to dependencies, and turns SLOs into working policy.

**🔁 Likely follow-up:** *"How do you avoid alert fatigue?"* → "Alert on user symptoms, not causes; thresholds by burn rate; and require every paging alert to have a runbook and be actionable. Anything else becomes a dashboard or gets deleted."

📚 [Course 00 · Observability](../../../cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

---

### Q6. The cloud bill went up 40% this month. How do you approach it?

**What they assess:** whether you know where the money actually is.

**❌ What NOT to say**

> "We downsize the instances and turn off what isn't used."

**Why it's wrong:** acting before measuring, and attacking the line everyone talks about (compute) which rarely causes a sudden jump. Blind downsizing can degrade the service and save far less than a single change in traffic or storage.

**⚠️ Acceptable answer**

> "I review the bill broken down by service to see what grew, and look for idle or oversized resources."

**What it's missing:** attribution per team/product, the usual suspects, and the change that caused it.

**✅ Ideal answer**

> "First I attribute: break it down by service and by team or product tag, and compare against last month to isolate *what* grew and *when*, because a sudden 40% almost always has a change behind it — a deploy, a new job, a log retention setting, cross-zone traffic that didn't exist before. The usual suspects, in order of surprise, are egress and cross-zone traffic, NAT, storage and snapshots nobody deletes, non-production environments running 24/7, and logs at debug level with a year of retention. Compute is what everyone looks at and what least often spikes. After understanding, I act on two horizons: immediate — turn off idle resources, fix retention, private endpoints to avoid NAT — and structural: commitments for the stable baseline, autoscaling with real data, and above all making spend visible per team, because what isn't attributed doesn't get optimised. And I add anomaly alerts, so I find out on day 3 instead of day 30."

**Why it works:** measures first, knows the real sinks, separates tactical from structural, adds prevention.

**🔁 Likely follow-up:** *"How do you get teams to optimise?"* → "By giving them their number and a comparison with similar teams, not an order. When a team sees their staging environment costs more than production, it fixes itself."

📚 [Course 04 · Reliability and cost](../../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

## Staff level

### Q7. Product teams complain that deploying is slow and they depend on you for everything. What do you do?

**What they assess:** whether you see the platform as a product rather than as control.

**❌ What NOT to say**

> "If we give them production access they'll break things. Better they keep raising tickets."

**Why it's wrong:** it makes the platform team a permanent bottleneck and moves responsibility for reliability away from the people writing the code. It also doesn't scale: more teams, longer queue. The alternative isn't "free access", it's automated guardrails.

**⚠️ Acceptable answer**

> "I'd automate the most common requests with templates and pipelines so teams can self-serve."

**What it's missing:** treating the platform as a product (users, feedback, adoption) and defining which guardrails replace manual control.

**✅ Ideal answer**

> "I treat the platform as an internal product with real users. First I talk to them and measure: what they raise tickets for, how often, how long they wait. That produces the self-service catalogue: create a new service with its pipeline, request a database, publish a route, rotate a secret. I ship it as golden paths: templates where the right thing is the easy thing, with observability, limits, security and reversible deploys already included. And I replace manual control with automated guardrails: cluster policies, image scanning, mandatory code review, error budgets. It isn't free access — it's making the safe path the most convenient one. I measure adoption and waiting time, and I retire what nobody uses, because an unadopted platform is a tax. And I leave escape hatches: if a team needs something off the path, they should be able to do it by talking to me, not get blocked."

**Why it works:** product thinking, measurement, golden paths, guardrails and escape hatches.

**🔁 Likely follow-up:** *"Who responds when something they deployed breaks?"* → "They do, with us supporting. On-call for the service belongs to whoever writes it; we're on call for the platform. Without that, the quality incentive disappears."

---

### Q8. Tell me about the worst incident you've lived through.

**What they assess:** method, honesty and learning. It's technical and behavioural at once.

**❌ What NOT to say**

> "A colleague dropped a production database by mistake. It was a disaster, but we sorted it out."

**Why it's wrong:** it points at a person, never states your role or method, and closes without learning. It also leaves an obvious question unanswered: why did the system let one person drop production alone?

**⚠️ Acceptable answer**

> "We had a multi-hour outage from a database problem. We investigated, restored from backup, and improved monitoring afterwards."

**What it's missing:** numbers, timeline, decisions under pressure and concrete prevention.

**✅ Ideal answer**

> "The hardest one was a full API outage for 40 minutes at peak, roughly 15,000 failed requests. It started after a routine deploy, though the deploy wasn't the cause: it had changed a config value that shrank the connection pool, and the database started refusing connections under load. I was coordinating. First containment: we rolled back, which fixed nothing because the system was already in a self-sustaining retry loop; so we cut retries and shed non-critical traffic, and it recovered in minutes. Then diagnosis, using evidence we'd captured before touching anything. The most uncomfortable part of the postmortem wasn't the cause — it was that it took us 12 minutes to find out, and a customer told us. Three actions came out: alert on pool saturation, not only on errors; retry budgets so a local problem can't amplify; and a review of which config values can change without review. We wrote it with no names: the person who changed the value wasn't the problem, the problem was that such a change had no guardrail."

**Why it works:** numbers, timeline, separates containment from cause, admits the painful detection metric, and ends in guardrails rather than blame.

**🔁 Likely follow-up:** *"What would you do differently?"* → "Capture evidence faster and communicate outwards sooner; we were slow to tell support and that multiplied the noise during the incident."

📚 [Course 08 · Incident playbook](../../../cursos/08-system-design/05-guion-de-incidentes.md)

---

## Quick rubric

| Dimension | What to check |
|---|---|
| **Method** | Did I scope and measure before touching anything? |
| **Evidence** | Did I capture state before restarting? |
| **Reliability** | Did I talk SLOs and error budgets, not just uptime? |
| **Cost** | Did I mention the economic impact of decisions? |
| **Autonomy** | Do my solutions give teams autonomy or create dependence on me? |
