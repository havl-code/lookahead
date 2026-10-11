# How the Analytics Scores Work 📐

The **Analytics** tab gives you three scores out of 100: **Speed**, **Consistency** and
**Overall**. This page explains exactly how each one is worked out, so you know what they're
telling you (and what they aren't).

---

## 🌍 The Short Version

Each score compares one of your sessions with **real WCA competitors in the same event**, and
tells you the percentage of them you beat:

- **Speed 80** means your typical result is faster than 80% of competitors' typical results.
- **Consistency 60** means your solves vary less than 60% of competitors' solves do.
- **Overall** is the average of the two.

So 50 is exactly the middle of the competitors, in any event. A 3x3x3 score and a 7x7x7 score
mean the same thing, because each event is compared only with people who compete in it.

---

## 👥 Who You're Compared With

The comparison uses the official [WCA results export](https://www.worldcubeassociation.org/export/results):
every competitor with an official result in the event from the **two years** up to the export
date. That's tens of thousands of people for the popular events (about 91,000 for 3x3x3) and
over a thousand even for the rarest ones.

The app ships with a small summary of those results, so it works offline. The summary keeps
where competitors fall (the time at every 0.1% of competitors), not anyone's personal results.
It's rebuilt from the latest export each month, so the two years move on with it, and the app
shows the dates it covers under the scores.

> This information is based on competition results owned and maintained by the World Cube
> Association, published at <https://worldcubeassociation.org/results> as of September 30, 2026.

---

## ⚡ Speed

### Your Typical Result

Your session is measured the same way the WCA ranks the event:

| Event | Official round | How your session is measured |
| --- | --- | --- |
| Most events (2x2x2 to 5x5x5, OH, Clock, Megaminx, Pyraminx, Skewb, Square-1) | Average of 5 | The median of your Ao5s |
| 6x6x6, 7x7x7 | Mean of 3 | The median of your Mo3s |
| 3BLD, 4BLD, 5BLD | Best of 3 | The median of your best-of-3 singles |

Your solves are split into back-to-back groups of 5 (or 3), in the order you did them, and
each group is scored exactly like a competition round:

- **Ao5:** drop the best and worst, average the middle 3. One DNF is dropped as the worst; two
  or more make the whole average a DNF.
- **Mo3:** the mean of all 3. Any DNF makes it a DNF.
- **Best of 3:** the fastest of the 3. It's only a DNF if all 3 are.

+2 penalties are included. Your **typical result** is the median of those groups (a DNF counts
as slower than any time). Any solves left over at the end, short of a full group, are left out.

### Your Speed Score

Each competitor's typical result is worked out the same way: the median of their official
round results in those two years. Your Speed score is the percentage of competitors whose
typical result is slower than yours. Competitors whose typical result is a DNF (common in the
blindfolded events) count as slower than any time. If your own typical result is a DNF, you
count as level with them, and anyone level with you counts as half beaten.

For example, in 3x3x3 the middle competitor's typical average is about 24 seconds, so a
typical Ao5 of 24 seconds scores about 50.

### Why the Median, and Why Groups?

- **Groups of 5 or 3** make your result directly comparable with an official one: an Ao5 from
  practice is the same kind of number as an Ao5 from a competition.
- **The median** is your typical performance, not your best. A competitor's ranking uses their
  best ever average, which would make everyone else look faster than they usually are. Using
  each competitor's median round instead compares typical with typical.

---

## 🎯 Consistency

### Your Spread

Consistency measures how much your solve times vary, relative to your typical solve:

1. Take every pair of **back-to-back** completed solves and note the gap between them.
2. Take the **median** of those gaps, and turn it into an estimate of the standard deviation
   (divide by 0.9539, explained below).
3. Divide by your **median solve time** to get your spread as a percentage.

A spread of 10% means roughly two thirds of your solves land within 10% of your usual time.

Pairs that include a DNF are skipped, since a DNF has no time. A session needs at least 21
solves (20 back-to-back pairs) to get a Consistency score.

### Your Consistency Score

Each competitor's spread is worked out the same way, from back-to-back attempts within their
official rounds (only competitors with at least 20 such pairs, so that each person's spread is
reliably measured). Your Consistency score is the percentage of competitors whose spread is
bigger than yours.

Spread differs a lot between events, which is why each event is compared only with itself. The
middle competitor's spread is about 14% in 3x3x3, 27% in 2x2x2 and 6% in 7x7x7.

### Why Back-to-Back Gaps?

The usual way to measure variation, the standard deviation of all your times, gets two things
wrong for cubing sessions:

- **It counts improvement as inconsistency.** If a long session starts at 18 seconds and ends
  at 12, the overall standard deviation is large even if every stretch of solves was steady.
  Back-to-back solves are only moments apart, so the gap between them reflects how steady you
  are, not how much you improved over weeks. (In a test with simulated solves that varied
  10% while improving from 18 to 12 seconds, the standard deviation said 14%; this method
  said 10%.)
- **One lockup dominates it.** Because the median gap is used, a handful of disasters barely
  move the result. (With 2% of solves made 20 seconds slower, the standard deviation jumped
  from 10% to 26%; this method gave 10%.)

This is the **median moving range** method used in statistical process control. For normally
distributed times, the median gap between two independent solves is 0.9539 standard
deviations (√2 × 0.6745), which is where that number comes from.

---

## 🏆 Overall

```text
Overall = (Speed + Consistency) ÷ 2
```

Both are percentages of the same group of competitors, so their average is a fair summary.
A session needs both scores to get an Overall score.

---

## 📊 What the Cards Show

The number on each card is the **average score of your 10 most recent sessions** in the event
(sessions too short for that score are left out). Underneath is the figure behind it from your
latest session that has one: your typical result for Speed, and your spread for Consistency.

The trend compares that with the average of the **10 sessions before them**:

- **↑ better than before:** more than 2 points higher
- **↓ lower than before:** more than 2 points lower
- **→ Steady:** within 2 points either way

Until you have more than 10 sessions there's nothing earlier to compare with, so the card says
how many more sessions it needs before the trend shows.

The bar's colour shows the score at a glance:

| Score | Colour |
| --- | --- |
| 80 to 100 | Green (excellent) |
| 60 to 79.9 | Orange (good) |
| 40 to 59.9 | Amber (average) |
| Below 40 | Red (needs work) |

Events without enough WCA data to compare with show no score: Multi-Blind (scored in points,
not time), and 4BLD and 5BLD for Consistency (fewer than 100 competitors have enough
successful attempts to measure).

---

## ⚠️ What to Keep in Mind

- **Practice isn't competition.** Many people are faster and steadier at home than on stage, so
  practice sessions usually score a little higher than the same person would in a
  competition. Read the scores as "where my practice would place me", not a prediction of
  competition results.
- **Competitors aren't all cubers.** People who enter competitions tend to be keener (and
  faster) than cubers in general, so scoring 50 already puts you in good company.
- **Small sessions are rough.** A session with only one or two Ao5s gives a rough Speed
  score, and Consistency needs at least 21 solves. More solves give steadier scores.
- **Big sessions are one number.** If you keep months of solves in one session (as a CSTimer
  import does when you untick splitting by day), its scores describe all of them together.
  Shorter sessions show your progress more clearly, which is one reason the timer starts a new
  session each day, and why CSTimer imports are split by day unless you say otherwise.
- **The 2 point trend is a rule of thumb**, not a statistical test, so treat small changes
  as noise.

---

## 💡 Where the Insights Come From

The tips under the scores come from the same numbers:

| Insight | When it shows |
| --- | --- |
| Strong improvement trend | Overall is more than 5 points higher than in the 10 sessions before |
| Performance has dipped | Overall is more than 5 points lower than in the 10 sessions before |
| Focus on consistency | Your recent Consistency averages below 30 |
| Excellent consistency | Your recent Consistency averages above 70 |
| Build up more data | You have fewer than 10 sessions in the event |
| Keep training! | None of the above apply |

---

## 🔧 For Developers

- The scores are worked out in [`speedcube/scores.py`](../speedcube/scores.py).
- The WCA summary is [`speedcube/wca_reference.json`](../speedcube/wca_reference.json), built by
  [`tools/build_wca_reference.py`](../tools/build_wca_reference.py) from the TSV results export.
  The build uses the same measuring code as the app, so competitors and sessions are always
  measured alike.
- A GitHub Actions workflow ([`wca-reference.yml`](../.github/workflows/wca-reference.yml))
  rebuilds it on the 3rd of each month and opens a pull request when it changes. To rebuild it
  by hand, download the latest export and run
  `uv run tools/build_wca_reference.py path/to/export.zip`, then
  `uv run tools/sync_wca_reference_docs.py` to update the export date the docs quote.
