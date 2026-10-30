# Deployment:
- this project will be deployeed in Netltify + postegres service (currently supabase) so it uses serverless functions for netlify and pooling connections.
- tune it for this deployment infra.

# General Goal and Purpose:
## 1- Payment and expenses calucaltor for Qattah (a group calcuator to make sure every person paid its due and keep evertyhing tracked and fair).
## 2- communication channels: these are channels to get verification codes for authentication and notifications:-
2.1- email
2.2- telegram
2.3- whatsapp (will implement it later)


# Database and Performance:
- the most important goal is data integrity and correct caluclations as well as fast performance.
- since we will use pooling connections every query matters so show me every query we will do to tune it, and avoid N +1 queries and uneccassry joins and tables.
- index everything we will use often.
- show me every database table and schema descition: every table matters.
- we need a schema suitable for fast performance and integrity.
- everything should only use what is necassry and scoped to what is needed.
- single source of truth archeticure and seperation of concerns (better use something like MVC or MVMM or what is needed for our case)

# Business Logic Core:
- we have groups: a group is indepenedent from other groups it has its own members and payments.
- for group members: there are paying members(which you can relay on them paying everytime) and other members.
- we have payments (any user paid) and expenses. and are grouped under abstract grouping called Activity.
- Activiy is a scope for current expenses and payments for this activity but not neccassrily for the user since the user can still have unpaid dues for previous activities or paid some amount before un activity.
- payment is the single source of truth for payments.
- for payment: a payment can be deducted from another payment. if user paid some amount then another used paid him.
## Ledger:
### for real paid amount and due amount:
- real paid amount: is calculated from this user payments. for extra payments and it will be automatically deducted for new activity expenses and due amount for those users.
- due amount: the logic differs between paying members and others:
-- for paying members: every activity expense in the group they are included in from the assigned starting point for that member. and due amount in the first place depends on by amount, shares or percentage set for that member, if null for that member then due amount must be set manually for that member per each activity.
-- for other members: they should be explicitly listed for that activity to include that activity expenses in thier due amounts, and it depends on first place on by amount, share or percentage set for that user, if null then must be set explicitly.
#### baseline: is the expected amount to be needed to fulfill the necassry expenses
- it is scoped per activity total amount of expenses and paying members and listed other members, so
it is not general like due amount and real paid amount.
- per activity baseline logic:
-- out of scope for now, lets ignore baseline entirely for now, and not include it in frontend nor backend.

# Frontend Rules:
- mobile first experience.
- bilingual support: English and Arabic.
- minimalist style.
- database friendly.