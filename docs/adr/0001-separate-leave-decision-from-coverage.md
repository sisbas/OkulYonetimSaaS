# Separate leave decision from operational coverage

Approved leave remains a decision fact owned by the Leave aggregate, while operational coverage ownership and derived state live behind the Daily Operations boundary; coverage must never approve a pending leave, and substitution assignment/clear must recompute coverage from persisted impact and assignment counts in the same transaction.
