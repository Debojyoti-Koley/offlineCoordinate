import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import GetLocation, { Location, isLocationError } from 'react-native-get-location';
import ToggleSwitch from 'toggle-switch-react-native'

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [speed, setSpeed] = useState<number>(0); // m/s
  const [acceleration, setAcceleration] = useState<number>(0); // m/s²
  const [altitude, setAltitude] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [calculatedSpeed, setCalculatedSpeed] = useState<number>(0); // m/s

  //toggle values
  const [toggle, setToggle] = useState<boolean>(false);


  const requestingRef = useRef(false);
  const prevSpeedRef = useRef(0);
  const prevLocationRef = useRef<Location | null>(null);


  useEffect(() => {
    getCurrentLocation();
    const intervalTimeValue = toggle ? 11000 : 2000;
    console.log('Interval time set to:', intervalTimeValue);
    const interval = setInterval(() => getCurrentLocation(), intervalTimeValue);
    return () => clearInterval(interval);
  }, [toggle]);

  useEffect(() => {
    console.log('New location received');
    const current = currentLocation;
    const previous = prevLocationRef.current;

    if (!current) {
      console.log('Current location is null');
    }
    if (!previous) {
      console.log('Previous location is null');
      prevLocationRef.current = current;
      return;
    }
    if (!current || !previous) return;

    const timeDiff = (current.time - previous.time) / 1000;
    console.log('Current time:', current.time);
    console.log('Previous time:', previous.time);
    console.log('prevtime diff:', timeDiff);
    if (timeDiff <= 0) return;

    console.log('Time difference (s):', timeDiff);

    const gpsSpeed = current.speed; // m/s (hardware)
    let speedNow = 0;

    // calculate distance-based speed
    const rawDistance = calculateDistance(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude
    );
    const calculatedRawSpeed = rawDistance / timeDiff;
    console.log('distance calculated:', rawDistance);
    setCalculatedSpeed(calculatedRawSpeed);

    // Use GPS hardware speed when valid
    if (gpsSpeed != null && gpsSpeed >= 0 && gpsSpeed < 100) {
      speedNow = gpsSpeed;
    } else {
      // fallback to distance-based speed
      speedNow = calculatedRawSpeed;
    }

    // Low-pass filter to smooth noisy jumps
    const smoothSpeed = prevSpeedRef.current * 0.4 + speedNow * 0.6;

    // Calculate acceleration
    const acc = (smoothSpeed - prevSpeedRef.current) / timeDiff;

    prevSpeedRef.current = smoothSpeed;

    setSpeed(smoothSpeed);
    setAcceleration(acc);
  }, [currentLocation]);

  const getCurrentLocation = async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;

    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (!granted) {
          const permissionResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission denied', 'Location permission is required.');
            return;
          }
        }
      }

      const location = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: toggle ? 10000 : 8000,
      });

      if (location.accuracy != null) {
        setCurrentAccuracy(location.accuracy);
      }

      if (location.altitude != null) {
        setAltitude(location.altitude);
      }

      // Filter bad GPS accuracy
      if (!toggle && location.accuracy != null && location.accuracy > 15) {
        console.log('Skipping bad-accuracy reading:', location.accuracy);
        return;
      }

      // update previous location ref with last good currentLocation
      if (currentLocation) {
        prevLocationRef.current = currentLocation;
      }

      setCurrentLocation(prev => {
        if (prev) {
          // this is the real previous location
          prevLocationRef.current = prev;
        }
        return location; // new currentLocation
      });
    } catch (error) {
      if (isLocationError(error)) {
        console.warn('Location error', error.code, error.message);
      }
    } finally {
      requestingRef.current = false;
    }
  };

  const toRadians = (deg: number) => deg * (Math.PI / 180);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // m
    const decimal_values = toggle ? 4 : 5;
    lat1 = truncateNum(lat1, decimal_values);
    lon1 = truncateNum(lon1, decimal_values);
    lat2 = truncateNum(lat2, decimal_values);
    lon2 = truncateNum(lon2, decimal_values);

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const truncateNum = (num: number, decimalPlaces: number): number => {
    let roundUpNumber = Number(num.toFixed(6));
    let factor = Math.pow(10, decimalPlaces);
    let fixedNum = Math.trunc(roundUpNumber * factor) / factor;
    return fixedNum;
  };


  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        <Text style={styles.textStyle}>GPS</Text>
        <View style={styles.toggleStyle}>
          <Text style={styles.toggle}>Airplane mode</Text>
          <ToggleSwitch
            isOn={toggle}
            onColor="green"
            offColor="red"
            label="Example label"
            labelStyle={{ color: "black", fontWeight: "900" }}
            size="large"
            onToggle={() => setToggle(prev => !prev)}
          />
        </View>

        <View style={styles.coordinateStyle}>
          <Text style={styles.SubHeaderTextStyle}>Current Location</Text>
          {currentLocation ? (
            <Text style={styles.textStyle}>{`Lat: ${currentLocation.latitude}\nLon: ${currentLocation.longitude}`}</Text>
          ) : (
            <Text style={styles.textStyle}>No location</Text>
          )}
        </View>

        <View>
          <View style={styles.coordinateStyle}>
            <Text style={styles.SubHeaderTextStyle}>Speed (km/h)</Text>
            <Text style={styles.textStyle}>{(speed * 3.6).toFixed(2)}</Text>
          </View>
          <View style={styles.coordinateStyle}>
            <Text style={styles.SubHeaderTextStyle}>Calculated Speed (km/h)</Text>
            <Text style={styles.textStyle}>{Math.floor(calculatedSpeed * 3.6)}</Text>
          </View>
        </View>

        <View style={styles.coordinateStyle}>
          <Text style={styles.SubHeaderTextStyle}>Acceleration (m/s²)</Text>
          <Text style={styles.textStyle}>{acceleration.toFixed(2)}</Text>
        </View>

        <View style={styles.coordinateStyle}>
          <Text style={styles.SubHeaderTextStyle}>Accuracy (m - radius)</Text>
          {currentAccuracy != null ? (
            <Text style={styles.textStyle}>{currentAccuracy.toFixed(1)}</Text>
          ) : (
            <Text style={styles.textStyle}>--</Text>
          )}
        </View>

        <View style={styles.coordinateStyle}>
          <Text style={styles.SubHeaderTextStyle}>Altitude (m)</Text>
          {altitude != null ? (
            <Text style={styles.textStyle}>{altitude.toFixed(1)}</Text>
          ) : (
            <Text style={styles.textStyle}>--</Text>
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  textStyle: {
    color: '#fff',
    fontSize: 22,
  },
  coordinateStyle: {
    marginVertical: 20,
    color: '#fff',
    alignItems: 'center',
  },
  SubHeaderTextStyle: {
    color: '#fff',
    fontSize: 18,
  },
  toggle: {

  },
  toggleStyle: {

  }
});

export default App;






// toggle approach 


// import {
//   StatusBar,
//   StyleSheet,
//   useColorScheme,
//   View,
//   Text,
//   Platform,
//   PermissionsAndroid,
//   Alert,
// } from 'react-native';
// import { SafeAreaProvider } from 'react-native-safe-area-context';
// import React, { useState, useEffect, useRef } from 'react';
// import GetLocation, { Location, isLocationError } from 'react-native-get-location';
// import ToggleSwitch from 'toggle-switch-react-native';

// function App() {
//   const isDarkMode = useColorScheme() === 'dark';

//   const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
//   const [speed, setSpeed] = useState<number>(0); // m/s
//   const [acceleration, setAcceleration] = useState<number>(0); // m/s²
//   const [altitude, setAltitude] = useState<number | null>(null);
//   const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
//   const [calculatedSpeed, setCalculatedSpeed] = useState<number>(0); // m/s

//   // toggle values
//   const [toggle, setToggle] = useState<boolean>(false);

//   const requestingRef = useRef(false);
//   const prevSpeedRef = useRef(0); // used for smoothing in continuous mode
//   const prevLocationRef = useRef<Location | null>(null); // used for continuous mode
//   const lastSampleRef = useRef<Location | null>(null); // used for pairwise (toggle ON) sampling

//   useEffect(() => {
//     // when toggle changes we want to reset sampling state for pairwise mode
//     lastSampleRef.current = null;
//     // run an immediate sample when toggle changes (and also on mount)
//     getCurrentLocation();

//     // interval: 11s in toggle-mode, else 2s
//     const intervalTimeValue = toggle ? 11000 : 2000;
//     console.log('Interval time set to:', intervalTimeValue);

//     const interval = setInterval(() => getCurrentLocation(), intervalTimeValue);
//     return () => clearInterval(interval);
//   }, [toggle]);

//   // continuous-mode effect (only used when toggle===false)
//   useEffect(() => {
//     if (toggle) return; // skip continuous calculations when in pairwise mode

//     const current = currentLocation;
//     const previous = prevLocationRef.current;

//     if (!current) {
//       // nothing to do yet
//       return;
//     }

//     if (!previous) {
//       // first valid reading for continuous mode — set prev and wait for next
//       prevLocationRef.current = current;
//       return;
//     }

//     const timeDiff = (current.time - previous.time) / 1000;
//     if (timeDiff <= 0) {
//       prevLocationRef.current = current;
//       return;
//     }

//     const gpsSpeed = current.speed; // hardware speed (m/s)
//     let speedNow = 0;

//     // fallback raw distance speed
//     const rawDistance = calculateDistance(
//       previous.latitude,
//       previous.longitude,
//       current.latitude,
//       current.longitude
//     );
//     const calculatedRawSpeed = rawDistance / timeDiff;
//     setCalculatedSpeed(calculatedRawSpeed);

//     if (gpsSpeed != null && gpsSpeed >= 0 && gpsSpeed < 100) {
//       speedNow = gpsSpeed;
//     } else {
//       speedNow = calculatedRawSpeed;
//     }

//     // Low-pass filter to smooth noisy jumps
//     const smoothSpeed = prevSpeedRef.current * 0.4 + speedNow * 0.6;

//     // Calculate acceleration correctly: (v_now - v_prev) / dt
//     const acc = (smoothSpeed - prevSpeedRef.current) / timeDiff;

//     prevSpeedRef.current = smoothSpeed;
//     prevLocationRef.current = current;

//     setSpeed(smoothSpeed);
//     setAcceleration(acc);
//   }, [currentLocation, toggle]);

//   const getCurrentLocation = async () => {
//     if (requestingRef.current) return;
//     requestingRef.current = true;

//     try {
//       if (Platform.OS === 'android') {
//         const granted = await PermissionsAndroid.check(
//           PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
//         );

//         if (!granted) {
//           const permissionResult = await PermissionsAndroid.request(
//             PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
//           );
//           if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
//             Alert.alert('Permission denied', 'Location permission is required.');
//             requestingRef.current = false;
//             return;
//           }
//         }
//       }

//       const location = await GetLocation.getCurrentPosition({
//         enableHighAccuracy: true,
//         timeout: toggle ? 10000 : 8000,
//       });

//       // update UI fields
//       if (location.accuracy != null) {
//         setCurrentAccuracy(location.accuracy);
//       }

//       if (location.altitude != null) {
//         setAltitude(location.altitude);
//       }

//       // When toggle is OFF (continuous mode), skip bad accuracy readings
//       if (!toggle && location.accuracy != null && location.accuracy > 15) {
//         console.log('Skipping bad-accuracy reading (continuous mode):', location.accuracy);
//         requestingRef.current = false;
//         return;
//       }

//       // ALWAYS update currentLocation so UI shows the latest reading
//       setCurrentLocation(location);

//       // === Pairwise sampling logic for toggle ===
//       if (toggle) {
//         // Accept readings regardless of accuracy in toggle mode (per your description)
//         const last = lastSampleRef.current;
//         if (last == null) {
//           // first sample: store and wait for next
//           lastSampleRef.current = location;
//           console.log('Toggle ON: stored first sample at time', location.time);
//           // reset calculatedSpeed until next sample arrives
//           setCalculatedSpeed(0);
//         } else {
//           // second (or Nth) sample: compute distance & time between last and current
//           const timeDiff = (location.time - last.time) / 1000;
//           if (timeDiff > 0) {
//             const distance = calculateDistance(
//               last.latitude,
//               last.longitude,
//               location.latitude,
//               location.longitude
//             );
//             const cSpeed = distance / timeDiff; // m/s
//             console.log('Toggle ON: pairwise distance', distance, 'timeDiff', timeDiff, 'speed m/s', cSpeed);
//             setCalculatedSpeed(cSpeed);
//             // update last sample to this one for next interval comparison
//             lastSampleRef.current = location;
//           } else {
//             // suspicious timestamps — replace last sample
//             lastSampleRef.current = location;
//             setCalculatedSpeed(0);
//           }
//         }
//         // In toggle mode we do not update continuous-mode prevLocationRef here.
//         requestingRef.current = false;
//         return;
//       }

//       // === Non-toggle (continuous) mode ===
//       // Update prevLocationRef so effect can compute between previous & current
//       // (We update prevLocationRef only if it is null — continuous effect handles replacement)
//       if (prevLocationRef.current == null) {
//         prevLocationRef.current = location;
//       }

//     } catch (error) {
//       if (isLocationError(error)) {
//         console.warn('Location error', error.code, error.message);
//       } else {
//         console.warn('Unknown location error', error);
//       }
//     } finally {
//       requestingRef.current = false;
//     }
//   };

//   const toRadians = (deg: number) => deg * (Math.PI / 180);

//   const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
//     const R = 6371000; // m
//     const decimal_values = toggle ? 4 : 5; // your existing behavior

//     lat1 = truncateNum(lat1, decimal_values);
//     lon1 = truncateNum(lon1, decimal_values);
//     lat2 = truncateNum(lat2, decimal_values);
//     lon2 = truncateNum(lon2, decimal_values);

//     console.log('lat 1:', lat1)
//     console.log('lat2:', lat2)

//     const dLat = toRadians(lat2 - lat1);
//     const dLon = toRadians(lon2 - lon1);

//     const a =
//       Math.sin(dLat / 2) ** 2 +
//       Math.cos(toRadians(lat1)) *
//       Math.cos(toRadians(lat2)) *
//       Math.sin(dLon / 2) ** 2;

//     return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
//   };

//   const truncateNum = (num: number, decimalPlaces: number): number => {
//     let roundUpNumber = Number(num.toFixed(6));
//     let factor = Math.pow(10, decimalPlaces);
//     let fixedNum = Math.trunc(roundUpNumber * factor) / factor;
//     return fixedNum;
//   };

//   return (
//     <SafeAreaProvider>
//       <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
//       <View style={styles.container}>
//         <Text style={styles.textStyle}>GPS</Text>
//         <View style={styles.toggleStyle}>
//           <ToggleSwitch
//             isOn={toggle}
//             onColor="green"
//             offColor="red"
//             label="Example label"
//             labelStyle={{ color: '#fff',fontSize: 22,  fontWeight: '600' }}
//             size="large"
//             onToggle={() => {
//               // Reset sampling state when toggling
//               lastSampleRef.current = null;
//               prevLocationRef.current = null;
//               prevSpeedRef.current = 0;
//               setCalculatedSpeed(0);
//               setSpeed(0);
//               setAcceleration(0);
//               setToggle(prev => !prev);
//             }}
//           />
//         </View>

//         <View style={styles.coordinateStyle}>
//           <Text style={styles.SubHeaderTextStyle}>Current Location</Text>
//           {currentLocation ? (
//             <Text style={styles.textStyle}>{`Lat: ${currentLocation.latitude}\nLon: ${currentLocation.longitude}`}</Text>
//           ) : (
//             <Text style={styles.textStyle}>No location</Text>
//           )}
//         </View>

//         <View>
//           <View style={styles.coordinateStyle}>
//             <Text style={styles.SubHeaderTextStyle}>Speed (km/h)</Text>
//             <Text style={styles.textStyle}>{(speed * 3.6).toFixed(2)}</Text>
//           </View>
//           <View style={styles.coordinateStyle}>
//             <Text style={styles.SubHeaderTextStyle}>Calculated Speed (km/h)</Text>
//             <Text style={styles.textStyle}>{Math.floor(calculatedSpeed * 3.6)}</Text>
//           </View>
//         </View>

//         <View style={styles.coordinateStyle}>
//           <Text style={styles.SubHeaderTextStyle}>Acceleration (m/s²)</Text>
//           <Text style={styles.textStyle}>{acceleration.toFixed(2)}</Text>
//         </View>

//         <View style={styles.coordinateStyle}>
//           <Text style={styles.SubHeaderTextStyle}>Accuracy (m - radius)</Text>
//           {currentAccuracy != null ? (
//             <Text style={styles.textStyle}>{currentAccuracy.toFixed(1)}</Text>
//           ) : (
//             <Text style={styles.textStyle}>--</Text>
//           )}
//         </View>

//         <View style={styles.coordinateStyle}>
//           <Text style={styles.SubHeaderTextStyle}>Altitude (m)</Text>
//           {altitude != null ? (
//             <Text style={styles.textStyle}>{altitude.toFixed(1)}</Text>
//           ) : (
//             <Text style={styles.textStyle}>--</Text>
//           )}
//         </View>
//       </View>
//     </SafeAreaProvider>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     backgroundColor: '#000',
//   },
//   textStyle: {
//     color: '#fff',
//     fontSize: 22,
//   },
//   coordinateStyle: {
//     marginVertical: 20,
//     color: '#fff',
//     alignItems: 'center',
//   },
//   SubHeaderTextStyle: {
//     color: '#fff',
//     fontSize: 18,
//   },
//   toggle: {
//     color: '#fff',
//     fontSize: 22,
//     margin: 0,
//   },
//   toggleStyle: {
//     flexDirection: 'row',
//     justifyContent: 'space-around',
//     alignItems: 'center',
//     width: '50%',
//   },
// });

// export default App;
