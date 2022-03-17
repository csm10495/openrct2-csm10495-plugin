import {
  isUiAvailable
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

function park_config_get(key, dflt){
  var res = context.getParkStorage("csm10495-plugin").get(key, dflt);
  // console.log("Got: " + key + " it is " + res);
  return res;
}

function park_config_set(key, value) {
  // console.log("Setting: " + key + " to " + value);
  return context.getParkStorage("csm10495-plugin").set(key, value);
}


function setMinWaitOnAllRides() {
  // enable any load with no min/max time and leave if another train arrives
  // also set max lift hill speed
  map.rides.filter(notEmpty).forEach( ride => {
    ride.minimumWaitingTime = 1;
    ride.departFlags = 4;
    ride.departFlags |= DepartFlags.WaitFor
    ride.departFlags |= DepartFlags.AnotherTrainArives
    ride.departFlags &= ~DepartFlags.MinimumWaitingTime
    ride.departFlags &= ~DepartFlags.MaximumWaitingTime

    ride.liftHillSpeed = ride.maxLiftHillSpeed;
  })
}

function toBool(thing){
  return JSON.parse(thing)
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
      "height": 50,
      "title" : "csm10495-Plugin",
      "widgets" : [
        {
          type: 'checkbox',
          name: 'EnableMinWait',
          text: 'Enable Min Wait On all Rides',
          isChecked: toBool(park_config_get('EnableMinWait', "false")),
          x: 5,
          y: 20,
          width:200,
          height:10,
          "onChange" : function(isChecked) {
            park_config_set('EnableMinWait', isChecked)
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
