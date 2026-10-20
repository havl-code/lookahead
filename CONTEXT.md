# Lookahead

A speedcubing timer and training tracker that runs offline in the browser, on a phone or a
computer, with each device keeping its own solves.

## Language

### Apps and Layouts

**Desktop app**:
Lookahead 3.x, the local Flask app retired in 4.0.
_Avoid_: desktop layout, desktop version (for anything in 4.0 or later)

**Phone layout**:
The app below 1024 px wide: one column with the tab bar along the bottom.
_Avoid_: mobile view, small screen

**Wide layout**:
The app at 1024 px wide or more, whatever the device: the tabs along the top, and screens that
use the width.
_Avoid_: desktop layout, computer layout, tablet layout

### Screens

**Tab**:
One of the app's four top-level screens: Timer, Sessions, Analytics, and More. The same four in
both layouts.
_Avoid_: page, section, view

**Dashboard**:
The Analytics tab in the wide layout, with the overview, scores, insights, and charts laid out
in a grid. Not a tab of its own.
_Avoid_: Dashboard tab, home

**Sheet**:
A modal panel for one task over a tab, such as a solve's details or the timer settings. It rises
from the bottom in the phone layout and sits in the middle in the wide layout.
_Avoid_: modal, popup, drawer
