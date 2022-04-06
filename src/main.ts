import {
  isUiAvailable,
  getStaff,
  getHandymen,
  getMechanics,
  getSecurity,
  getEntertainers
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
      "height": 80,
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
        }
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
