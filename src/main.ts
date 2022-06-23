import { isUiAvailable, getStaff, getGuests } from './helpers';

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

enum DepartFlags {
  None = 0,
  Flag0 = 1 << 0,
  Flag1 = 1 << 1,
  Flag2 = 1 << 2,
  WaitFor = 1 << 3,
  AnotherTrainArives = 1 << 4,
  Synchronise = 1 << 5,
  MinimumWaitingTime = 1 << 6,
  MaximumWaitingTime = 1 << 7,
}

enum StaffType {
  Handyman = 0,
  Mechanic = 1,
  Security = 2,
  Entertainer = 3,
}

const RIDE_TYPE_FLAG_ALLOW_MORE_VEHICLES_THAN_STATION_FITS = 1 << 38;
const ContinuousCircuitBlockSectioned = 34;

// in the game this is -32768; .. div by 32 to match up with tiles
const XY_PEEP_LOCATION_NULL = -32768; // on a ride, or something like that
const XY_TILE_LOCATION_NULL = XY_PEEP_LOCATION_NULL / 32; // on a ride, or something like that

const HALF_TILE_SIZE = 16;
const FULL_TILE_SIZE = 16 * 2;

const ENTRANCE_OBJECT_PARK_ENTRANCE_EXIT = 2;
const ENTRANCE_SEQUENCE_MIDDLE = 0;

function parkConfigGet(key, dflt) {
  const res = context.getParkStorage('csm10495-plugin').get(key, dflt);
  // console.log("Got: " + key + " it is " + res);
  return res;
}

function parkConfigSet(key, value) {
  // console.log("Setting: " + key + " to " + value);
  return context.getParkStorage('csm10495-plugin').set(key, value);
}

function hasStatsCalculated(ride) {
  return ride.excitement !== -1;
}

function peepXYToTileCoordinate(c: number) {
  return Math.floor(c / 32.0);
}

function peepZToTileCoordinate(c: number) {
  return Math.floor(c / 8.0);
}

function tileCoordinatesHaveSurface(
  x: number,
  y: number,
  z: number | boolean,
  validSurfaces: Array<string>,
) {
  // When given these coordinates, return true if any of the given surfaces are found.

  //console.log("-- x, y, z: " + x + ", " + y + ", " + z);
  const tile = map.getTile(x, y);
  //console.log("tile x, y: " + tile.x + ", " + tile.y);

  function matchingZ(element: TileElement, index, array) {
    if (z === true) {
      return true;
    }

    return (
      peepZToTileCoordinate(element.baseZ) <= z
      && peepZToTileCoordinate(element.clearanceZ) >= z
    );
  }
  const matchingCoordTileElements: Array<TileElement> = tile.elements.filter(matchingZ);

  let isValid = false;
  matchingCoordTileElements.forEach((titleElement) => {
    //console.log(titleElement.type.toString());
    validSurfaces.forEach((surface: string) => {
      if (titleElement.type === surface) {
        isValid = true;
      }
    });
  });

  if (!isValid) {
    // a XY_TILE_LOCATION_NULL location typically means on a ride, so make it seem like they're on a track
    if (
      x === XY_TILE_LOCATION_NULL
      || (y === XY_TILE_LOCATION_NULL && validSurfaces.includes('track'))
    ) {
      isValid = true;
    }

    /*
    if (!isValid) {
      console.log("-- x, y, z: " + x + ", " + y + ", " + z);
      matchingCoordTileElements.forEach(function(titleElement){
        console.log(titleElement.type.toString());
      });
    }
    */
  }

  return isValid;
}

function getXYInFrontOf(xy: CoordsXY, direction: Direction | number) {
  let x = xy.x + HALF_TILE_SIZE;
  let y = xy.y + HALF_TILE_SIZE;
  if (direction === 0) {
    x += FULL_TILE_SIZE;
  } else if (direction === 1) {
    y -= FULL_TILE_SIZE;
  } else if (direction === 2) {
    x -= FULL_TILE_SIZE;
  } else if (direction === 3) {
    y += FULL_TILE_SIZE;
  }

  const ret = <CoordsXY>{};
  ret.x = x;
  ret.y = y;
  return ret;
}

function peepOnSurface(peep: Guest | Staff, surfaces: Array<string>) {
  // console.log("Checking peep: " + peep.name);
  return tileCoordinatesHaveSurface(
    peepXYToTileCoordinate(peep.x),
    peepXYToTileCoordinate(peep.y),
    peepZToTileCoordinate(peep.z),
    surfaces,
  );
}

function tileCoordinatesToPeepCoordinates(coords: CoordsXY) {
  return <CoordsXY>{
    x: coords.x * 32,
    y: coords.y * 32,
  };
}

function movePeepToValidPath(peepToMove: Guest | Staff) {
  let guestOnPath: Guest = null;

  getGuests().every((guest) => {
    // technically a footpath surface shouldn't really appear with a null peep location... but it seems to happen.
    //  .. must be a bug somewhere.. so safeguard against it here.
    if (
      peepOnSurface(guest, ['footpath'])
      && guest.isInPark
      && guest.x !== XY_PEEP_LOCATION_NULL
      && guest.y !== XY_PEEP_LOCATION_NULL
      && guest.id !== peepToMove.id
    ) {
      guestOnPath = guest;
      return false;
    }
    // console.log("could not move to: " + guest.name);
    return true;
  });

  if (guestOnPath != null) {
    peepToMove.x = guestOnPath.x;
    peepToMove.y = guestOnPath.y;
    peepToMove.z = guestOnPath.z;
  } else {
    // last ditch effort: if no other guests... plop right outside a ride exit
    const ridesWithExits = map.rides.filter((ride: Ride) => ride.stations.length > 0 && ride.stations[0].exit != null);

    if (ridesWithExits.length > 0) {
      const { exit } = ridesWithExits[0].stations[0];
      const coords = <CoordsXY>{
        x: exit.x,
        y: exit.y,
      };
      const xy = getXYInFrontOf(coords, exit.direction);
      peepToMove.x = xy.x;
      peepToMove.y = xy.y;
      peepToMove.z = exit.z;
    } else {
      // super last ditch effort... no rides... so plop just inside park entrance
      let done = false;
      for (let x = 0; x < map.size.x; x++) {
        if (done) {
          break;
        }
        for (let y = 0; y < map.size.y; y++) {
          if (done) {
            break;
          }
          const tile = map.getTile(x, y);

          tile.elements.every((element) => {
            if (element.type === 'entrance') {
              const entrance = element as EntranceElement;
              if (
                entrance.object === ENTRANCE_OBJECT_PARK_ENTRANCE_EXIT
                && entrance.sequence === ENTRANCE_SEQUENCE_MIDDLE
              ) {
                const xy = tileCoordinatesToPeepCoordinates(<CoordsXY>{
                  x: tile.x,
                  y: tile.y,
                });
                // console.log(xy);

                peepToMove.x = xy.x;
                peepToMove.y = xy.y;
                peepToMove.z = element.baseZ;
                done = true;
                return false;
              }
            }
            return true;
          });
        }
      }

      if (!done) {
        park.postMessage('Unable to pathify guests');
      }
    }
  }
}

function pathify(peep: Guest | Staff) {
  if (!peepOnSurface(peep, ['footpath', 'track', 'entrance'])) {
    //console.log("Peep: " + peep.name + " is not on a valid surface... attempting to move them.");
    movePeepToValidPath(peep);
    return true;
  }
  return false;
}

function setMinWaitOnAllRides() {
  // enable any load with no min/max time and leave if another train arrives
  // also set max lift hill speed
  map.rides.filter(notEmpty).forEach((ride) => {
    if (ride.classification === 'ride') {
      ride.minimumWaitingTime = 1;
      ride.maximumWaitingTime = 1;

      // clear bit 0 and 1
      ride.departFlags &= ~(1 << 0);
      ride.departFlags &= ~(1 << 1);

      // Setting this bit sets to "Any Load"
      ride.departFlags |= 4;
      ride.departFlags |= DepartFlags.WaitFor;
      ride.departFlags &= ~DepartFlags.MinimumWaitingTime;
      ride.departFlags &= ~DepartFlags.MaximumWaitingTime;
      ride.liftHillSpeed = ride.maxLiftHillSpeed;

      // if the ride hasn't had stats calculated yet, let it go on its own
      // this will let it calculate stats.
      if (!hasStatsCalculated(ride)) {
        ride.departFlags |= DepartFlags.MaximumWaitingTime;
      } else if (ride.mode === ContinuousCircuitBlockSectioned) {
        // If we have blocked sections, set a max wait time to ensure folks don't get stuck if no one is in-line.
        ride.maximumWaitingTime = 5;
        ride.departFlags |= DepartFlags.MaximumWaitingTime;
      }

      // If we only have one station, no need to auto leave UNLESS more vehicles than a station fits
      // are allowed. If we didn't have this flag in this case, someone could get stuck forever
      if (
        ride.stations.length > 1
        || ride.object.flags & RIDE_TYPE_FLAG_ALLOW_MORE_VEHICLES_THAN_STATION_FITS
      ) {
        ride.departFlags |= DepartFlags.AnotherTrainArives;
      }
    }
  });
}

function toBool(thing) {
  return JSON.parse(thing);
}

function fireStaff(id) {
  context.executeAction(
    'stafffire',
    {
      id,
    },
    (result) => {
      // console.log(result);
    },
  );
}

let windowIsOpen = false;
let window: Window;

function showUi() {
  if (windowIsOpen) {
    window.bringToFront();
  } else {
    window = ui.openWindow({
      classification: 'classification?',
      width: 200,
      height: 100,
      title: 'csm10495-Plugin',
      widgets: [
        {
          type: 'checkbox',
          name: 'EnableMinWait',
          text: 'Enable Min Wait On all Rides',
          isChecked: toBool(parkConfigGet('EnableMinWait', 'false')),
          x: 5,
          y: 20,
          width: 190,
          height: 10,
          onChange(isChecked) {
            parkConfigSet('EnableMinWait', isChecked);
          },
        },
        {
          type: 'button',
          name: 'FireAllStaff',
          text: 'Fire All Staff',
          x: 5,
          y: 35,
          width: 190,
          height: 15,
          onClick() {
            getStaff().forEach((staffMember) => {
              fireStaff(staffMember.id);
            });
          },
        },
        {
          type: 'button',
          name: 'ReplaceAllStaff',
          text: 'Replace All Staff',
          tooltip:
            'Fires all staff, but then re-hires ones in their place. Note that staff blue-printing is not maintained.',
          x: 5,
          y: 55,
          width: 190,
          height: 15,
          onClick() {
            const staff: Staff[] = getStaff();

            staff.forEach((staffMember) => {
              let typ = 0;
              if (staffMember.staffType === 'handyman') {
                typ = StaffType.Handyman;
              } else if (staffMember.staffType === 'mechanic') {
                typ = StaffType.Mechanic;
              } else if (staffMember.staffType === 'entertainer') {
                typ = StaffType.Entertainer;
              } else if (staffMember.staffType === 'security') {
                typ = StaffType.Security;
              }
              context.executeAction(
                'staffhire',
                {
                  autoPosition: true,
                  staffType: typ,
                  entertainerType: staffMember.costume,
                  staffOrders: staffMember.orders,
                },
                (result) => {
                  //console.log(result);
                },
              );

              fireStaff(staffMember.id);
            });
          },
        },
        {
          type: 'button',
          name: 'PutGuestsBackOnPath',
          text: 'Pathify Guests',
          tooltip:
            'Ensure that guests are either on a path or on a ride. If a guest is walking around (but not on a path) they will be moved to be on a path.',
          x: 5,
          y: 75,
          width: 93,
          height: 15,
          onClick() {
            let count: number = 0;
            getGuests().forEach((p) => {
              if (p.isInPark && pathify(p)) {
                count++;
              }
            });
            if (count > 0) {
              park.postMessage(`Pathified ${count} Guests`);
            }
          },
        },
        {
          type: 'button',
          name: 'PutStaffBackOnPath',
          text: 'Pathify Staff',
          tooltip:
            'Ensure that staff are either on a path or on a ride. If a staff is walking around (but not on a path) they will be moved to be on a path.',
          x: 102,
          y: 75,
          width: 93,
          height: 15,
          onClick() {
            let count: number = 0;
            getStaff().forEach((p) => {
              if (pathify(p)) {
                count++;
              }
            });
            if (count > 0) {
              park.postMessage(`Pathified ${count} Staff`);
            }
          },
        },
      ],
      onClose() {
        windowIsOpen = false;
      },
    });
    windowIsOpen = true;
  }
}

const main = (): void => {
  if (isUiAvailable) {
    ui.registerMenuItem('csm10495-Plugin', () => {
      showUi();
    });
  }

  // show the ui on park open if we haven't shown the ui before
  if (
    isUiAvailable
    && toBool!(parkConfigGet('HasShownUiOnParkStart', 'false')) === false
  ) {
    showUi();
    parkConfigSet('HasShownUiOnParkStart', 'true');
  }

  context.subscribe('interval.day', () => {
    //console.log("A day passed");
    if (toBool(parkConfigGet('EnableMinWait', 'false'))) {
      setMinWaitOnAllRides();
    }
  });
};

export default main;
