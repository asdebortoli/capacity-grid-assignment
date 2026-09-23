# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

Mostly business logic/rules. In a real project, I would clarify these with the product team prior to implementation:

- Default week start date: I decided on Monday by convention.
- Working days only: I decided to treat weekends as 0h capacity and 0h work assuming they aren't counted towards work because they usually aren't.
- Inclusive assignment start/end dates: I decided inclusive for better user experience.
- Partial weeks: I decided to display the exact user selected dates for better experience when filtering dates.
- Editing scope: I assumed that changing a person's capacity would affect all history not just future weeks. This fits the fixed schema, which stores one capacity value per person without historical versions.
- Updating data after editing: I decided to refetch the selected range so backend remains the source of truth. This kept the implementation simple and avoided duplicating calculations in the frontend. If saving felt slow, I would consider optimistic updates with rollback logic for failed requests.
- Validation: I decided on adding two validation limits which were max range of 366 days and max weekly hours 120 as safeguards.
- Only displaying hours: I decided to keep the view focused on each person's allocated hours and capacity to keep the assignment simple and focused. Project details could become a future feature, such as clicking a person's week to see the assignments behind those hours.


## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- Repeated assignments: Some assignments looked duplicated because they had the same person, project, dates and hours. I decided to count them separately because the seed was fixed and to assume they were duplicates would require a business rule that was not specified.

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- Working process: The AI initially tried to do too much at once without enough clarification or validation with me. I had to define a clear workflow: first set up and verify the starter codebase, then understand the requirements, discuss unclear decisions and agree on the architecture. After that, we broke the implementation into small tasks with clear goals and expected outcomes. We implemented, tested and reviewed each task together before moving to the next. I also made it clear that assumptions should be discussed with me before becoming implementation decisions.

## What would you do differently with a week?

- Clarify the rules/pending decisions
- Look for bugs/performance issues and fix them
- Improve the overall UI/UX
- And definitely test it a bunch more ;)
