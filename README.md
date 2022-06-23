# openrct2-csm10495-plugin

A simple plugin for doing the things I like to do in OpenRCT2.

![Menu](static/menu.jpg)

## Features

### Enable Min Wait On All Rides

When enabled: attempts to get a high throughput on all rides via this algorithm (ran once a day):

- Sets "Wait for Any Load"
- Sets min/max wait time to 1 second
- If a ride doesn't have ride stats calculated yet, enable max wait time
- Set the ride's lift speed to the maximum hill lift speed for the ride type
- If a ride is using Continuous Circuit with Block Sections, set max wait time of 5 seconds and enable max wait time
- If a ride has more than one station or can have more vehicles than a single station fits, enable "Leave if another train arrives"

### Fire All Staff

Fires all staff in park

### Replace All Staff

Fires and then rehires all staff (without zoning). Note that staff may get new names/numbers.

### Pathify

Takes all guests (or staff) and ensures they are on a path. If they are not, move them to a path.
