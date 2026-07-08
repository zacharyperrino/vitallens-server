# Food-scan eval cases

Each case is a directory containing a meal photo with **weighed** ground truth:

```
meals/
  chicken-rice-broccoli/
    photo.jpg          # the meal photo (jpg/jpeg/png)
    expected.json      # ground truth, weighed on a kitchen scale
```

`expected.json`:

```json
{
  "items": [
    { "label": "grilled chicken breast", "grams": 180 },
    { "label": "white rice", "grams": 160 },
    { "label": "broccoli", "grams": 90 }
  ],
  "total_calories": 520
}
```

Run (API server must be running, costs one GPT-4o call per case):

```
cd server && npm run eval:food
```

Reports per-case item recall, grams MAE, and calorie error, plus aggregate
calorie MAE/MAPE. Re-run after any pipeline change to measure the delta.
