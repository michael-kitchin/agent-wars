# Coding Prompts

Reusable prompts for the agent workflow. The core cycle is four prompts: [plan](#plan-a-capability), [audit the plan](#audit-the-plan), [implement](#implement-the-plan), and [audit the implementation](#audit-the-implementation).

## Design a Capability

Please create a design document in the .spec directory reflecting the changes needed for `<capability>`. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

Details:

((As needed: Bullets))

## Plan a Capability

Please create an execution plan markdown document in the .spec directory to implement `<capability>`. This capability is to be implemented by a lower-quality coding agent than yourself, and should be planned in phases organized for maximum reliability and clarity. Each phase should be independently verifiable or at least verifiable with previously completed phases. Also ensure that the generated code will be reliable and understandable for future developers. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

Details:

((As needed: Bullets))

## Audit the Plan

Ensure the plan is complete, correct, consistent, unlikely to cause regressions with other reasonable input and circumstances, addresses my stated needs, and otherwise complies with my rules. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

## Audit the Documents

Ensure the documents are complete, correct, consistent, address my stated needs, and otherwise comply with my rules. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Implement the Plan

Implement all in-scope phases of the execution plan in order with the recommended options, or at least as much of the plan as you can without intervention. Before you start, ask any questions you need to in order to execute more reliably or deliver more reliable or higher-quality results.

((or))

Implement phase `<phase>` of the execution plan, or at least as much of it as you can without intervention. Ensure the implementation is reliable and understandable for future developers, and complies with my rules. Before you start, ask any questions you need to in order to execute more reliably or deliver more reliable or higher-quality results.

## Complete Optional Phases

Complete all in-scope phases of the execution plan (including optional phases) in order with the recommended options, or at least as much of the plan as you can without intervention. Before you start, ask any questions you need to in order to execute more reliably or deliver more reliable or higher-quality results.

## Confirm the Implementation

I believe I've implemented all in-scope phases of the execution plan and that the implementation is complete, correct, consistent, reliable, unlikely to cause regressions with other reasonable input and circumstances, and understandable for future developers, and complies with my rules. Please confirm or deny. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

## Choose the Next Capability

Review the design spec document, the design graphic, and the code. What is the most important missing capability or capabilities I should implement next, to iterate towards completion of the design while maximizing reliability and simplicity of the development process? Sort in descending order of importance. Before you get started, ask any questions you need to clarify my priorities, uncertainties you've identified, or anything else you need to know for reliable and high-quality results. Note that this request is in anticipation of generating a detailed execution plan, so I don't want code or document changes at this time.

## Record Answers

Answers:

((Answers))

((As needed:)) Note that these answers are in anticipation of generating a detailed execution plan at a later time, so I don't want any code or document changes at this time.

## Confirm a Phase

I believe I've implemented phase `<phase>` of the execution plan [and all earlier phases], and the implementation is reliable and understandable for future developers, and complies with my rules. Please confirm or deny. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

## Apply the Coding Rules

For all new and modified code:

((Include items 1-4, above; repeat across agents until clean))

## Propose Refactors

Review the uncommitted code for 3-5 useful, reliable, and specific opportunities for consolidation, reuse, or other refactoring that will improve maintainability, present these for approval in descending order of importance including an "all" option, and implement the options that I approve.

## Plan the Refactors

Please create an execution plan markdown document in the .spec directory to implement the most important 5-10 useful, reliable, and specific opportunities for consolidation, reuse, or other refactoring that will improve maintainability. These are to be implemented by a lower-quality coding agent than yourself, and should be planned in phases organized for maximum reliability and clarity. Each phase should be independently verifiable or at least verifiable with previously completed phases. Also ensure that the generated code will be reliable and understandable for future developers. Before you get started, ask any questions you need to ‌ensure reliable execution of the plan and reliable and high-quality results.

## Audit the Implementation

Ensure the implementation is complete, correct, consistent, unlikely to cause regressions with other reasonable input and circumstances, addresses my stated needs, is reliable and understandable for future developers, and complies with my rules. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Audit Your Changes

Ensure the changes you've made are complete, correct, consistent, unlikely to cause regressions with other reasonable input and circumstances, address my stated needs, are reliable and understandable for future developers, and comply with my rules. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Audit Uncommitted Files

Ensure all uncommitted files and the code and content within are complete, correct, consistent, unlikely to cause regressions with other reasonable input and circumstances, address my stated needs, are reliable and understandable for future developers, and comply with my rules. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Pull, Test, and Deploy

1. Pull from develop, resolve all conflicts, run all automated tests, and resolve all issues
2. If this results in code changes, build and deploy the system locally

## Update the Docs

Review all uncommitted files and the code and content within and update @doc to capture any spec-level changes, as needed.

## Review the Branch

Review `<documents>` and the code to determine if the changes in this branch are complete, correct, consistent, unlikely to cause regressions with other reasonable input and circumstances, address my stated needs, are reliable and understandable for future developers, and comply with my rules. If you identify concerns, group them as deal-breakers, potential problems, and nice-to-haves, sorted in descending order of importance within each category. For each of these concerns, explain why it matters and the best way to resolve it, then generate a draft Github PR comment for the original developer, with code references. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Post Review Comments

Add items `<items>` to the Github PR as review comments. Comments should be prefixed with "Agent" and a compact, human-friendly model ID (example: "Agent (Opus 5.5): "), so the original developer knows who wrote the text.

## Find Leftover TODOs

Review the design spec document, the design graphic, and the code. Identify any remaining TODOs that should be resolved or stub/placeholder code that should be removed.

## Check the README Settings

Ensure the README.md captures a complete, correct list of configuration properties and other, similar declarative settings essential for deploying and running the software. For every item, ensure there are clear, correct, and consistent descriptions that would be understandable and useful for a developer-focused audience.

## Set Getter Logs to Trace

Update the logging calls in getters that don't modify application state to be at trace level, but leave the other logging calls alone.

## Confirm Getter Logs

I believe that I've updated the logging calls in getters that don't modify application state to be at trace level, but I've left all others alone. Confirm or deny.

## Sync the Documents

Ensure all documents in the `<.spec|other directory>` reflect what's in the codebase, are complete, correct, consistent, and otherwise comply with my guidelines. The codebase is the source of truth. Apply all the corrections you can automatically. Before you start, please ask any questions you need to in order to ensure reliable execution and reliable and high-quality results.

## Explain the Work

I need to ensure that by the time this code leaves my control I understand:

1. What functionality is there, including the overall codebase and what’s been changed in the current branch
2. Why that functionality is there and why those changes have been made
3. Why those changes are the best choice for this client, project, and task
4. Caveats, gotchas, or other obvious concerns or limitations that remain

Please review the .spec documents and codebase, then provide this information. Before you start, please ask any questions you need to in order to ensure reliable execution and reliable and high-quality results.

## Standard Coding Rules

Standard coding rules:

### 1. Reliable and Understandable Code

Please ensure all generated code is reliable and easy to understand. Double-check if generating for the first time.

### 2. Backend Logging

Please ensure that all new and updated public backend method invocations generate debug-level log messages, all caught exceptions generate error-level log messages, and all getter-style methods that don't modify state generate trace-level messages. Ensure all new and updated log messages include a reasonable level of detail for troubleshooting, and use the existing logging APIs. Note that these logging APIs check log levels before building message strings, so it's unnecessary to check the log level beforehand unless potentially large strings are being constructed inline with the logging call itself.

### 3. Testing Standards

Please ensure that we're only testing happy paths and essential failure cases for all new and updated code. We want to test essential code contracts and not implementation details. We do not need to test REST controller methods that directly delegate to component calls, DTO constructors, accessors, or similar boilerplate. Please remove any test cases or classes made unnecessary by these restrictions.

### 4. Orienting Comments

Please ensure all new and updated fields and non-overriding methods of all cardinalities (static/instance, outer/inner) and access levels (public, private, and package-private) have correctly formatted orienting comments. An orienting comment explains why a field or method exists and generally when to use it, how to use it, and what to expect in terms of results and exceptions. Comments for interface and abstract methods focus on code contracts, while those for implementation methods focus on high-level implementation details.

### 5. Spec Documents

Write working specs, execution plans, design proposals, and debugging notes as markdown files in the `.spec` directory.

Living product documentation belongs in `doc/`. This includes the UX specification suite (`doc/ux-specification.md` and the `doc/ux/` folder) and the mechanics documents indexed by `doc/README.md`. Update those documents in place; do not copy them into `.spec`.

### 6. Reusable Code

Please look for, create, and evolve reusable code and other elements, to the extent this doesn't put reliability, performance, user experience, or other goals at significant risk.

### 7. Modern Coding Patterns

Use the most reasonable, up-to-date coding patterns for the chosen language level (examples: Java stream APIs instead of for-loops).

### 8. Boilerplate Reduction

Use boilerplate reduction techniques and related language features where reasonable (example: Lombok annotations and record classes in Java).

### 9. Source File Size Limits

The desirable size limit for all source files is 600 lines, and a hard limit is 1000. When you reach these limits, move and/or decompose functionality to reasonably partitioned and organized sub-modules.

### 10. Method Argument Limits

The desirable limit of named method/function arguments is 6 and a hard limit is 10. When you reach these limits, move and/or decompose functionality to reasonably partitioned and organized sub-methods/-functions. Parameter objects are an acceptable alternative, as long as they otherwise comply with my rules.

### 11. No Commit or Push

Never commit or push changes under any circumstances. I intend to review all changes before sharing them with other developers.

### 12. No Plan or Workflow Identifiers in Version Control

Identifiers used in phases, stages, hypotheses, or other divisions in plans, debugging workflows, or files in the `.spec` or `.test` folders should never be included in code, comments, configuration files, documentation, or anything else that is (or is likely to be) in version control.

### 13. Mutable and Immutable Symbols

Classes, fields, variables, arguments, functions and other symbols should be marked according to their intended mutability or immutability, as appropriate for the chosen language level (examples: final in Java, const in TypeScript, and open in Kotlin).

### 14. Naming Conventions

Follow `doc/naming-conventions-contract-v1.md`. Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase; exported types are PascalCase. Use only the allowed role suffixes (`Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, `Types`). Do not use `Utils` or `Impl`. Do not put milestone or tool-group numbers in identifiers. Do not rename frozen string values (IPC channels, LLM tool names, SQL columns, vendor JSON fields). Do not put identifiers used to name plans, workflows, or spec phases into product code, comments, configuration, or lint messages.

### 15. No Secrets or PII in Version Control

#### Committed Material

Do not commit real secret values (examples: credentials, API keys, credit card numbers) or PII (examples: real names, ID numbers, or contact information for a real person). This applies to production source, comments, configuration (examples: properties files, Docker Compose files), documentation, and anything else that is or is likely to be in version control, except as described below. A public organizatioinal contact address is not PII.

#### Allowed Names and Stores

Names and references that are allowed include: environment variable names, parameter names, and secret-store paths, with no secret value beside them. Files, parameters, and other mechanisms that read, store, or transmit secrets and PII are allowed. Keep real values in a gitignored file or a remote store. Prefer (but do not require) a remote secret store such as AWS Secrets Manager or an encrypted database column.

#### Production Code

Do not write production code that stores, manages, or transmits secrets or PII in cleartext or over an unencrypted channel, except when the current request explicitly confirms it. Confirmation allows that handling, but does not allow real secrets or PII to be committed.

#### Test Samples

Sample secrets and sample PII are allowed only in a section of the codebase dedicated to testing, such as test source or fixture files. A comment, note, or documentation within or adjacent to that section must indicate that these values are for testing. These values must not be real or real-looking credentials, keys, or PII. Dedicated test code may store, manage, and transmit secrets and PII in cleartext or over an unencrypted channel without confirmation.

#### Local Placeholders

Obvious local-only placeholders are also allowed in committed local configuration. These must be clearly fake defaults for local use, not real credentials or real PII.

## Estimate a Capability

I intend to estimate `<capability>`.

For this I need:

1. A maximum of ten development task names that describe this. Task names should be simple, direct, and as imperative as possible (example: "spec writing for...", "codegen for...", "testgen for...", "add X to...", "update Y to...", "smoke test Z", "design A to...", "fix B to...", etc.), preferably no more than ten  words. 
2. We do not need task names for code review/verification, QA, or documentation (we have standard tasks for these). 
3. Group similar tasks as needed to meet the max task count goal.
4. Minimize articles and connecting verbs to reduce wordcount.
5. Abbreviate, substitute "&" for "and", " w/" for "with", and minimize technical specifics to reduce wordcount.
6. No semicolon, emdash, emoji, or arrow use.
7. Use only alphanumeric characters with standard punctuation.

For each task generate the following three relative effort scores, starting with 1.0 (in other words: 2.0 is twice as much effort and 0.5 is half):

1. Best Case:  Smallest reasonable effort, with actual work within estimates 25% of the time (i.e., a 1 in 4 chance of coming true).
2. Worst Case: Largest reasonable effort, with actual work within estimates 75% of the time (i.e., a 3 in 4 chance of coming true).
3. Most Likely: Most probable effort, using best judgment.

Task names and BWL values should be listed in a preformatted markdown block on their own line and separated by tabs, to enable easy copying/pasting into a spreadsheet.

Methodology notes:

A. We use an agentic development workflow, typically consisting of the following tasks: spec writing, code generation (codegen), test plan generation (testgen), and test plan execution and troubleshooting, all followed by hands-on verification and QA

B. Spec writing is commonly split by functional domain into overlapping documents, such as (for example) admin Ui and report import. We will work one task per document.

C. Codegen is rarely split into multiple tasks, except when necessary

D. Spec, codegen, and testgen work should be grouped by codebase proximity or other technical overlap into as few tasks as will be reasonable, for this style of development

Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Audit the Estimates

Ensure the task mix and estimates are complete, correct, consistent, addresses my stated needs, and will be clear and understandable for other estimators. Before you get started, ask any questions you need to in order to ensure reliable and high-quality results.

## Write Acceptance Criteria

Now generate acceptance criteria (AC) for this capability, as follows:

1. No more than ten AC with no more than a dozen words each.
2. AC are suitable for code reviewers, QA, and stakeholders during acceptance. 
3. AC are clear, concise, and provable.
4. AC do not need to specify obvious invariants, such as "it should work", "it should work more than once", or "it doesn't break anything else", etc.
5. Group similar AC as needed to meet the max task count goal.
6. Minimize articles and connecting verbs to reduce wordcount.
7. Abbreviate, substitute "&" for "and", " w/" for "with", and minimize technical specifics to reduce wordcount.
8. No semicolon, emdash, emoji, or arrow use.
9. Use only alphanumeric characters with standard punctuation.
