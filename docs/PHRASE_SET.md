# Voice phrase set

Status: **Proposed.** This is a draft for collaborator review in Phase 1 (D4). Synonyms marked † are guesses at Philippine charting shorthand and are **pending interview data**.

Source of truth: `src/parsing/voicePhrase.ts`. If this document and the code disagree, the code wins. Fix whichever is wrong.

## How to dictate

1. Press push-to-talk, **pause briefly**, then speak. In testing, the first short word was often lost when speech started immediately (FEASIBILITY.md, Spike 1).
2. Say a keyword, then its number. You can say several vitals in one go, in any order.
3. Release. Check every field before confirming.

> "BP one twenty over eighty, pulse seventy six, respiratory rate eighteen, oxygen ninety eight, temperature thirty six point seven."

## Keywords

| Field | Say any of |
| --- | --- |
| Blood pressure | blood pressure, B P |
| Temperature | temperature, temp |
| Pulse | pulse, pulse rate, heart rate, H R, P R †, C R †, cardiac rate † |
| Respiratory rate | respiratory rate, respiration(s), R R |
| Oxygen saturation | oxygen saturation, oxygen, O two, O two sat, S P O two, saturation, sat, pulse ox, pulse oximetry |

Spelled-out letters ("B P", "H R") are being tested. With some models they cause numbers to be misheard as letters (FEASIBILITY.md, finding 4).

## Numbers

| Say | Read as |
| --- | --- |
| one twenty / one hundred twenty / one hundred and twenty | 120 |
| one oh five | 105 |
| a hundred | 100 |
| thirty six point seven | 36.7 |
| thirty seven point oh / point zero | 37.0 |
| one twenty over eighty / slash / by | 120 / 80 |

Unit words are ignored: "percent", "degrees", "celsius", "beats per minute", "breaths", "millimeters of mercury".

## What gets flagged instead of filled

The app never guesses (D29). These leave the field empty with a message and one-tap options:

| Situation | Example | Result |
| --- | --- | --- |
| Same field, different values | "pulse seventy two … pulse eighty" | Conflict: choose 72 or 80 |
| BP without the second number | "blood pressure one ten over" | Diastolic not heard |
| BP without "over" | "BP one twenty eighty" | Did you mean 120/80? |
| Temperature without "point" | "temperature thirty six seven" | Did you mean 36.7? |
| Two numbers after one keyword | "pulse seventy six eighty" | Choose 76 or 80 |
| Keyword with no number | "pulse" | No value heard |
| Numbers before any keyword | "seventy two pulse eighty" | "seventy two" shown as unrecognized |

Range checks (D7) run after parsing, as for every other input method.
