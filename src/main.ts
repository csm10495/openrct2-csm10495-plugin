import {
  isUiAvailable,
  getStaff,
  getGuests
} from './helpers';

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
  Entertainer = 3
}

var RIDE_TYPE_FLAG_ALLOW_MORE_VEHICLES_THAN_STATION_FITS = (1 << 38);
var ContinuousCircuitBlockSectioned = 34;

// in the game this is -32768; .. div by 32 to match up with tiles
var XY_PEEP_LOCATION_NULL = -32768; // on a ride, or something like that
var XY_TILE_LOCATION_NULL = XY_PEEP_LOCATION_NULL / 32; // on a ride, or something like that

var HALF_TILE_SIZE = 16;
var FULL_TILE_SIZE = 16 * 2;

function park_config_get(key, dflt){
  var res = context.getParkStorage("csm10495-plugin").get(key, dflt);
  // console.log("Got: " + key + " it is " + res);
  return res;
}

function park_config_set(key, value) {
  // console.log("Setting: " + key + " to " + value);
  return context.getParkStorage("csm10495-plugin").set(key, value);
}

function has_stats_calculated(ride) {
  return ride.excitement != -1;
}

function tile_coordinates_have_surface(x: number, y: number, z: number | boolean, valid_surfaces: Array<string>) {
  // When given these coordinates, return true if any of the given surfaces are found.

  //console.log("-- x, y, z: " + x + ", " + y + ", " + z);
  var tile = map.getTile(x, y);
  //console.log("tile x, y: " + tile.x + ", " + tile.y);

  function matching_z(element: TileElement, index, array) {
    if (z == true)
    {
      return true;
    }

    return peep_z_to_tile_coordinate(element.baseZ) <= z && peep_z_to_tile_coordinate(element.clearanceZ) >= z;
  }
  var matching_coord_tile_elements:Array<TileElement> = tile.elements.filter(matching_z);

  var is_valid = false;
  matching_coord_tile_elements.forEach(function(title_element){
    //console.log(title_element.type.toString());
    valid_surfaces.forEach(function (surface: string) {
      if (title_element.type == surface) {
        is_valid = true;
      }
    });
  });

  if (!is_valid)
  {
    // a XY_TILE_LOCATION_NULL location typically means on a ride, so make it seem like they're on a track
    if (x == XY_TILE_LOCATION_NULL || y == XY_TILE_LOCATION_NULL && valid_surfaces.includes("track")) {
      is_valid = true;
    }

    /*
    if (!is_valid) {
      console.log("-- x, y, z: " + x + ", " + y + ", " + z);
      matching_coord_tile_elements.forEach(function(title_element){
        console.log(title_element.type.toString());
      });
    }
    */
  }

  return is_valid;
}

function peep_on_surface(peep: Guest | Staff, surfaces: Array<string>) {
  // console.log("Checking peep: " + peep.name);
  return tile_coordinates_have_surface(peep_xy_to_tile_coordinate(peep.x),
                                       peep_xy_to_tile_coordinate(peep.y),
                                       peep_z_to_tile_coordinate(peep.z),
                                       surfaces);
}

function move_peep_to_valid_path(peep_to_move: Guest | Staff) {
  var guest_on_path: Guest = null;

  getGuests().every(function(guest) {
    // technically a footpath surface shouldn't really appear with a null peep location... but it seems to happen.
    //  .. must be a bug somewhere.. so safeguard against it here.
    if (peep_on_surface(guest, ["footpath"]) && guest.isInPark && guest.x != XY_PEEP_LOCATION_NULL && guest.y != XY_PEEP_LOCATION_NULL && guest.id != peep_to_move.id) {
      guest_on_path = guest;
      return false;
    }
    else{
      // console.log("could not move to: " + guest.name);
      return true;
    }
  });

  if (guest_on_path != null) {
    peep_to_move.x = guest_on_path.x;
    peep_to_move.y = guest_on_path.y;
    peep_to_move.z = guest_on_path.z;
  }
  // last ditch effort: if no other guests... plop right outside a ride exit
  else {
    var rides_with_exits = map.rides.filter(function (ride: Ride){
      return ride.stations.length > 0 && ride.stations[0].exit != null;
    });

    if (rides_with_exits.length > 0) {
      var exit = rides_with_exits[0].stations[0].exit;
      var x = exit.x + HALF_TILE_SIZE;
      var y = exit.y + HALF_TILE_SIZE;
      var z = exit.z;
      if (exit.direction == 0) {
        x += FULL_TILE_SIZE;
      }
      else if (exit.direction == 1) {
        y -= FULL_TILE_SIZE;
      }
      else if (exit.direction == 2) {
        x -= FULL_TILE_SIZE;
      }
      else if (exit.direction == 3) {
        y += FULL_TILE_SIZE;
      }
      peep_to_move.x = x;
      peep_to_move.y = y;
      peep_to_move.z = z;
    }
    else {
      console.log("Nowhere available to move peep: " + peep_to_move.name);
    }
  }
}


function pathify(peep: Guest | Staff) {
  if (!peep_on_surface(peep, ["footpath", "track", "entrance"])) {
    //console.log("Peep: " + peep.name + " is not on a valid surface... attempting to move them.");
    move_peep_to_valid_path(peep);
    return true;
  }
  return false;
}

function peep_xy_to_tile_coordinate(c: number)
{
  return Math.floor(c / 32.0);
}

function peep_z_to_tile_coordinate(c: number)
{
  return Math.floor(c / 8.0);
}

function setMinWaitOnAllRides() {
  // enable any load with no min/max time and leave if another train arrives
  // also set max lift hill speed
  map.rides.filter(notEmpty).forEach( ride => {
    if (ride.classification == "ride") {
      ride.minimumWaitingTime = 1;
      ride.maximumWaitingTime = 1;

      // clear bit 0 and 1
      ride.departFlags &= ~(1 << 0)
      ride.departFlags &= ~(1 << 1)

      // Setting this bit sets to "Any Load"
      ride.departFlags |= 4;
      ride.departFlags |= DepartFlags.WaitFor
      ride.departFlags &= ~DepartFlags.MinimumWaitingTime
      ride.departFlags &= ~DepartFlags.MaximumWaitingTime
      ride.liftHillSpeed = ride.maxLiftHillSpeed;

      // if the ride hasn't had stats calculated yet, let it go on its own
      // this will let it calculate stats.
      if (!has_stats_calculated(ride))
      {
        ride.departFlags |= DepartFlags.MaximumWaitingTime
      }
      // If we have blocked sections, set a max wait time to ensure folks don't get stuck if no one is in-line.
      else if (ride.mode == ContinuousCircuitBlockSectioned)
      {
        ride.maximumWaitingTime = 5;
        ride.departFlags |= DepartFlags.MaximumWaitingTime;
      }

      // If we only have one station, no need to auto leave UNLESS more vehicles than a station fits
      // are allowed. If we didn't have this flag in this case, someone could get stuck forever
      if (ride.stations.length > 1 || (ride.object.flags & RIDE_TYPE_FLAG_ALLOW_MORE_VEHICLES_THAN_STATION_FITS))
      {
        ride.departFlags |= DepartFlags.AnotherTrainArives
      }
    }
  })
}

function toBool(thing){
  return JSON.parse(thing)
}

function fireStaff(id) {
  context.executeAction("stafffire",{
      "id" : id
    }, function (result) {
    // console.log(result);
  })
}

var window_is_open = false;
var window:Window;

function showUi() {
  if (window_is_open) {
    window.bringToFront();
  }
  else {
    window = ui.openWindow({
      "classification": 'classification?',
      "width": 200,
      "height": 100,
      "title" : "csm10495-Plugin",
      "widgets" : [
        {
          type: 'checkbox',
          name: 'EnableMinWait',
          text: 'Enable Min Wait On all Rides',
          isChecked: toBool(park_config_get('EnableMinWait', "false")),
          x: 5,
          y: 20,
          width:190,
          height:10,
          "onChange" : function(isChecked) {
            park_config_set('EnableMinWait', isChecked)
          }
        },
        {
          type: 'button',
          name: 'FireAllStaff',
          text: 'Fire All Staff',
          x: 5,
          y: 35,
          width:190,
          height:15,
          "onClick" : function() {
              getStaff().forEach(function(staff_member) {
                fireStaff(staff_member.id)
            });
          }
        },
        {
          type: 'button',
          name: 'ReplaceAllStaff',
          text: 'Replace All Staff',
          tooltip: "Fires all staff, but then re-hires ones in their place. Note that staff blue-printing is not maintained.",
          x: 5,
          y: 55,
          width:190,
          height:15,
          "onClick" : function() {
              let staff: Staff[] = getStaff();

              staff.forEach(function(staff_member) {
                let typ = 0;
                if (staff_member.staffType === "handyman") {
                  typ = StaffType.Handyman;
                } else if (staff_member.staffType === "mechanic") {
                  typ = StaffType.Mechanic;
                } else if (staff_member.staffType === "entertainer") {
                  typ = StaffType.Entertainer;
                } else if (staff_member.staffType === "security") {
                  typ = StaffType.Security;
                }
                context.executeAction("staffhire",{
                  "autoPosition" : true,
                  "staffType" : typ,
                  "entertainerType" : staff_member.costume,
                  "staffOrders" : staff_member.orders,
                }, function (result) {
                  //console.log(result);
                })

                fireStaff(staff_member.id)
              });
          }
        },
        {
          type: 'button',
          name: 'PutGuestsBackOnPath',
          text: 'Pathify Guests',
          tooltip: "Ensure that guests are either on a path or on a ride. If a guest is walking around (but not on a path) they will be moved to be on a path.",
          x: 5,
          y: 75,
          width:93,
          height:15,
          "onClick" : function() {
            var count: number = 0;
            getGuests().forEach(function (p){
              if (p.isInPark && pathify(p)) {
                count++;
              }
            });
            if (count > 0)
            {
              park.postMessage("Pathified " + count + " Guests");
            }
          }
        },
        {
          type: 'button',
          name: 'PutStaffBackOnPath',
          text: 'Pathify Staff',
          tooltip: "Ensure that staff are either on a path or on a ride. If a staff is walking around (but not on a path) they will be moved to be on a path.",
          x: 102,
          y: 75,
          width:93,
          height:15,
          "onClick" : function() {
            var count: number = 0;
            getStaff().forEach(function (p){
              if (pathify(p)) {
                count++;
              }
            });
            if (count > 0)
            {
              park.postMessage("Pathified " + count + " Staff");
            }
          }
        },
      ],
      "onClose": function() {
        window_is_open = false;
      }
    });
    window_is_open = true;
  }


}

const main = (): void => {
  if (isUiAvailable) {
    ui.registerMenuItem("csm10495-Plugin", function() {
      showUi();
    });
  }

  // show the ui on park open if we haven't shown the ui before
  if (isUiAvailable && toBool!(park_config_get('HasShownUiOnParkStart', "false")) === false) {
    showUi();
    park_config_set('HasShownUiOnParkStart', "true")
  }

  context.subscribe("interval.day", function()
  {
    //console.log("A day passed");
    if (toBool(park_config_get('EnableMinWait', "false"))) {
      setMinWaitOnAllRides();
    }
  });

};

export default main;
