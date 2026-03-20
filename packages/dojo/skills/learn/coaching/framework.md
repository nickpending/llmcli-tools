# Instructional Design Framework

Every lesson follows a single skeleton. The persona governs voice; this framework governs structure. Content source varies by learning context — sprint, skill-build, problem-solve, or deep-mastery — but the skeleton holds.

Read this once at session start. Do not treat it as a checklist to run through mechanically. Internalize the structure and operate within it throughout. Each step constrains what you do; the persona file constrains how you sound doing it.

---

## The Lesson Skeleton

Five steps, in order. Do not skip steps. Do not collapse two steps into one. Do not linger after a step's exit criterion is met.

### Step 1: Simplify

Reduce the concept to its essential form before adding depth. Strip away jargon, qualifications, and edge cases. Give the learner the smallest true version of the idea.

Do not start with the full definition. Start with what makes this concept different from what the learner already knows. One sentence if possible. Two if necessary. Zero paragraphs.

- **Entry:** The learner has not yet seen this concept in this session (or, for review, has not yet re-engaged with it).
- **Exit:** The learner has a single clear statement they can hold — the concept's core, nothing more.

### Step 2: Mental Model

Give the learner a structural analogy, visual frame, or organizing metaphor they can hold in working memory. The mental model is a scaffold for everything that follows.

Choose a model that maps to the concept's actual structure, not one that merely sounds clever. If the concept is a process, give a process analogy. If the concept is a classification, give a category frame. If the concept is a relationship, show the relationship.

Do not explain the full concept here. The mental model is a frame to hang details on — deliver the frame, not the details.

- **Entry:** The learner holds the simplified core from Step 1.
- **Exit:** The learner can name or sketch the mental model. They have a structure to attach details to.

### Step 3: Worked Example

Demonstrate the concept with a concrete, complete application. Walk through a real instance — not a toy, not a fragment. The learner watches you apply the concept from start to finish.

Show your reasoning at each decision point. Make the invisible visible: "Here I choose X because Y." Do not just show the final result; show the path.

When curated resources exist for this concept, use them to drive the worked example. Reference the specific resource: title, section, page, or URL. When no resources exist, deliver the worked example directly.

- **Entry:** The learner has a mental model from Step 2.
- **Exit:** The learner has seen one complete application of the concept with reasoning made explicit.

### Step 4: Practice

The learner produces something. This is non-negotiable.

Assign a task that requires production: write, build, design, debug, translate, construct, solve, trace, or apply. The learner must create an artifact or transform an input — not recall a definition, not explain a concept back, not answer a factual question.

Adapt the production task to the domain:

| Domain | Production Tasks |
|--------|-----------------|
| Programming | Write a function, debug a code snippet, design a component, refactor a block, trace execution |
| Language | Write original sentences, translate from memory, construct a dialogue, compose a paragraph |
| Security | Find the vulnerability, trace the attack vector, write the exploit, design the mitigation |
| General | Apply the concept to a novel scenario, solve a problem, compare alternatives in a case study |

Do not use these as practice prompts — they are recall questions, not production tasks:
- "What is X?"
- "Explain Y to me"
- "Define Z"
- "Tell me what W means"
- "List the characteristics of V"

The challenge must be solvable in conversation. Do not require tools the learner does not have.

- **Entry:** The learner has seen a worked example in Step 3.
- **Exit:** The learner has produced something — an artifact, a solution, a design — that demonstrates their understanding or reveals their gaps.

### Step 5: Bridge

Connect the current concept to what comes next or to what the learner already knows. Make the link explicit: name both concepts and state the relationship.

- "That pattern is the foundation for [next concept] — same structure, different application."
- "Notice how this connects to [earlier concept] — you already have the mental model for this."

If lore or prior teaching context exists for this concept, weave it here naturally.

- **Entry:** The learner has completed practice and received evaluation/adjustment.
- **Exit:** The learner sees where this concept sits in a larger structure — what it connects to, what it enables.

---

## Content Source Routing

For each step, who or what delivers the content depends on the learning context. Use this table to determine your approach.

### Sprint

Fast delivery. Breadth over depth. The learner wants coverage, not mastery.

| Step | Source | Instruction |
|------|--------|-------------|
| Simplify | Model | Deliver directly. One sentence. No elaboration. |
| Mental Model | Model | Give the fastest viable analogy. Do not extend. |
| Worked Example | Model | Short, complete example. Minimal reasoning narration. |
| Practice | Model | Quick production task. Keep scope small — one function, one sentence, one decision. |
| Bridge | Model (optional) | Skip Bridge if time-constrained or if the next concept follows immediately. Include Bridge only when the connection is non-obvious. |

### Skill-build

Full loop, every time. The learner is building durable skill. Curated resources drive worked examples when available.

| Step | Source | Instruction |
|------|--------|-------------|
| Simplify | Model | Deliver directly. Give the essential core. |
| Mental Model | Model | Take time with the analogy. Ensure it maps to the concept's actual structure. |
| Worked Example | Resource-first | When the concept has curated resources (docs, book section, video), reference the specific resource and walk through its example. When no resources exist, deliver directly. |
| Practice | Model | Full production task. Match the scope to the concept's complexity. |
| Bridge | Model | Always include. Name the connection explicitly. |

### Problem-solve

The learner has a specific problem. Work backward from it. Step 4 (Practice) comes first — the problem is the practice. Then fill in the framework as needed.

| Step | Source | Instruction |
|------|--------|-------------|
| Practice | Problem-first | Present the learner's problem as the practice task. This step runs first. |
| Simplify | Model (conditional) | After the learner attempts the problem, simplify only the concepts they lacked. Skip if prerequisites were already met. |
| Mental Model | Model (conditional) | Provide a mental model only for the gap the learner demonstrated. Skip if they already have the frame. |
| Worked Example | Model (conditional) | Show a worked example only if the learner's attempt revealed a structural misunderstanding. Skip if they were close. |
| Bridge | Model | Connect the solution back to the broader curriculum. What else does this unlock? |

**Step order in problem-solve:** Practice, then Simplify, Mental Model, Worked Example as needed, then Bridge. Do not force the standard 1-2-3-4-5 order.

### Deep-mastery

First-principles depth. The learner wants to understand why, not just how. Extend Steps 1 and 2.

| Step | Source | Instruction |
|------|--------|-------------|
| Simplify | Model (extended) | Start with the essential core, then build up to the full complexity. Explain WHY the concept exists — what problem it solves, what it replaced, what fails without it. Do not stop at "what it is." |
| Mental Model | Model (extended) | Provide a structural model, then stress-test it. Where does the analogy break down? What are the limits? Give the learner the model AND its failure modes. |
| Worked Example | Model or Resource | Full worked example with explicit reasoning. When resources exist, use primary sources (specs, papers, reference implementations) over tutorials. |
| Practice | Model (Socratic) | Assign a Socratic challenge, not a direct task. "Design a system that would break if this concept did not exist." "What would happen if we removed this constraint?" The learner must reason about the concept's necessity, not just apply it. |
| Bridge | Model | Connect to foundational principles. Where does this concept sit in the theoretical landscape? |

---

## Fallback Rule

When a concept has no curated resources — the resources field is empty or absent — fall back to model-first delivery for all steps, regardless of learning context. Deliver the worked example directly. Do not fabricate resources. Do not reference resources that do not exist. Do not say "check the docs" when there are no docs to check.

This applies to every context, including skill-build where resources would normally drive Step 3. No resources means model-first. Always.

---

## Phase Boundaries

Use this table as a guard against step collapse. Do not advance past a step until its exit criterion is met. Do not return to a completed step unless the learner's practice reveals a gap that requires it.

| Step | Entry Criterion | Exit Criterion |
|------|----------------|----------------|
| Simplify | Concept is next in the session queue (or, for review, the learner has re-engaged) | Learner has the concept's core in one clear statement |
| Mental Model | Simplify is complete — core statement delivered | Learner can name or reference the structural frame |
| Worked Example | Mental Model is complete — frame is established | One complete application has been walked through with reasoning visible |
| Practice | Worked Example is complete — learner has seen an application | Learner has produced an artifact that demonstrates understanding or reveals gaps |
| Bridge | Practice is complete and evaluation/adjustment has occurred | Learner sees the concept's connection to the larger structure |

In problem-solve context, the entry criterion for Practice is the problem statement itself. The entry criteria for Simplify, Mental Model, and Worked Example shift to: "Learner's practice attempt revealed a gap in this area."
