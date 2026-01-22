// Helper to get accuracy color
const getAccuracyColor = (accuracy: number | null) => {
  if (accuracy == null) return '#94a3b8';
  if (accuracy < 4) return '#22c55e'; // green
  if (accuracy < 10) return '#eab308'; // yellow
  return '#ef4444'; // red
};

// Helper to get accuracy label
const getAccuracyLabel = (accuracy: number | null) => {
  if (accuracy == null) return '';
  if (accuracy < 4) return 'Good accuracy';
  if (accuracy < 10) return 'Average accuracy';
  return 'Poor accuracy';
};
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  Platform,
  PermissionsAndroid,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import GetLocation, { Location, isLocationError } from 'react-native-get-location';
import ToggleSwitch from 'toggle-switch-react-native';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [speed, setSpeed] = useState<number>(0); // m/s
  const [acceleration, setAcceleration] = useState<number>(0); // m/s²
  const [altitude, setAltitude] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [calculatedSpeed, setCalculatedSpeed] = useState<number>(0); // m/s
  const [maxSpeed, setMaxSpeed] = useState<number>(0); // m/s
  const [maxCalculatedSpeed, setMaxCalculatedSpeed] = useState<number>(0); // m/s

  // toggle values
  const [toggle, setToggle] = useState<boolean>(false);

  const requestingRef = useRef(false);
  const prevSpeedRef = useRef(0); // used for smoothing in continuous mode
  const prevLocationRef = useRef<Location | null>(null); // used for continuous mode
  const lastSampleRef = useRef<Location | null>(null); // used for pairwise (toggle ON) sampling

  useKeepAwake();

  useEffect(() => {
    // when toggle changes we want to reset sampling state for pairwise mode
    lastSampleRef.current = null;
    // run an immediate sample when toggle changes (and also on mount)
    getCurrentLocation();

    // interval: 11s in toggle-mode, else 2s
    const intervalTimeValue = toggle ? 11000 : 2000;
    console.log('Interval time set to:', intervalTimeValue);

    const interval = setInterval(() => getCurrentLocation(), intervalTimeValue);
    return () => clearInterval(interval);
  }, [toggle]);

  // continuous-mode effect (only used when toggle===false)
  useEffect(() => {
    if (toggle) return; // skip continuous calculations when in pairwise mode

    const current = currentLocation;
    const previous = prevLocationRef.current;

    if (!current) {
      // nothing to do yet
      return;
    }

    if (!previous) {
      // first valid reading for continuous mode — set prev and wait for next
      prevLocationRef.current = current;
      return;
    }

    const timeDiff = (current.time - previous.time) / 1000;
    if (timeDiff <= 0) {
      prevLocationRef.current = current;
      return;
    }

    const gpsSpeed = current.speed; // hardware speed (m/s)
    let speedNow = 0;

    // fallback raw distance speed
    const rawDistance = calculateDistance(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude
    );
    const calculatedRawSpeed = rawDistance / timeDiff;
    setCalculatedSpeed(calculatedRawSpeed);
    setMaxCalculatedSpeed(prevMax => (calculatedRawSpeed > prevMax ? calculatedRawSpeed : prevMax));

    if (gpsSpeed != null && gpsSpeed >= 0 && gpsSpeed < 100) {
      speedNow = gpsSpeed;
    } else {
      speedNow = calculatedRawSpeed;
    }

    // Low-pass filter to smooth noisy jumps
    const smoothSpeed = prevSpeedRef.current * 0.4 + speedNow * 0.6;

    // Calculate acceleration correctly: (v_now - v_prev) / dt
    const acc = (smoothSpeed - prevSpeedRef.current) / timeDiff;

    prevSpeedRef.current = smoothSpeed;
    prevLocationRef.current = current;

    setSpeed(smoothSpeed);
    setMaxSpeed(prevMax => (smoothSpeed > prevMax ? smoothSpeed : prevMax));
    setAcceleration(acc);
  }, [currentLocation, toggle]);

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
            requestingRef.current = false;
            return;
          }
        }
      }

      const location = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: toggle ? 10000 : 8000,
      });

      // update UI fields
      if (location.accuracy != null) {
        setCurrentAccuracy(location.accuracy);
      }

      if (location.altitude != null) {
        setAltitude(location.altitude);
      }

      // When toggle is OFF (continuous mode), skip bad accuracy readings
      if (!toggle && location.accuracy != null && location.accuracy > 15) {
        console.log('Skipping bad-accuracy reading (continuous mode):', location.accuracy);
        requestingRef.current = false;
        return;
      }

      // ALWAYS update currentLocation so UI shows the latest reading
      setCurrentLocation(location);

      // === Pairwise sampling logic for toggle ===
      if (toggle) {
        // Accept readings regardless of accuracy in toggle mode (per your description)
        const last = lastSampleRef.current;
        if (last == null) {
          // first sample: store and wait for next
          lastSampleRef.current = location;
          console.log('Toggle ON: stored first sample at time', location.time);
          // reset calculatedSpeed until next sample arrives
          setCalculatedSpeed(0);
        } else {
          // second (or Nth) sample: compute distance & time between last and current
          const timeDiff = (location.time - last.time) / 1000;
          if (timeDiff > 0) {
            const distance = calculateDistance(
              last.latitude,
              last.longitude,
              location.latitude,
              location.longitude
            );
            const cSpeed = distance / timeDiff; // m/s
            console.log('Toggle ON: pairwise distance', distance, 'timeDiff', timeDiff, 'speed m/s', cSpeed);
            setCalculatedSpeed(cSpeed);
            setMaxCalculatedSpeed(prevMax => (cSpeed > prevMax ? cSpeed : prevMax));
            // update last sample to this one for next interval comparison
            lastSampleRef.current = location;
          } else {
            // suspicious timestamps — replace last sample
            lastSampleRef.current = location;
            setCalculatedSpeed(0);
            setMaxCalculatedSpeed(prevMax => (0 > prevMax ? 0 : prevMax));
          }
        }
        // In toggle mode we do not update continuous-mode prevLocationRef here.
        requestingRef.current = false;
        return;
      }

      // === Non-toggle (continuous) mode ===
      // Update prevLocationRef so effect can compute between previous & current
      // (We update prevLocationRef only if it is null — continuous effect handles replacement)
      if (prevLocationRef.current == null) {
        prevLocationRef.current = location;
      }

    } catch (error) {
      if (isLocationError(error)) {
        console.warn('Location error', error.code, error.message);
      } else {
        console.warn('Unknown location error', error);
      }
    } finally {
      requestingRef.current = false;
    }
  };

  const toRadians = (deg: number) => deg * (Math.PI / 180);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // m
    const decimal_values = toggle ? 4 : 5; // your existing behavior

    lat1 = truncateNum(lat1, decimal_values);
    lon1 = truncateNum(lon1, decimal_values);
    lat2 = truncateNum(lat2, decimal_values);
    lon2 = truncateNum(lon2, decimal_values);

    console.log('lat 1:', lat1)
    console.log('lat2:', lat2)

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

  function handleReset() {
    setMaxSpeed(0);
    setMaxCalculatedSpeed(0);
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>GPS dashboard</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {/* {currentAccuracy != null ? `Connected • ${currentAccuracy.toFixed(1)} m accuracy` : 'Connecting...'} */}
              Connected
            </Text>
          </View>
        </View>

        {/* Card: Toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.cardTitle}>Lenient GPS mode</Text>
            <ToggleSwitch
              isOn={toggle}
              onColor="#22d3ee"
              offColor="#334155"
              size="medium"
              onToggle={() => {
                lastSampleRef.current = null;
                prevLocationRef.current = null;
                prevSpeedRef.current = 0;
                setCalculatedSpeed(0);
                setSpeed(0);
                setAcceleration(0);
                setToggle(prev => !prev);
              }}
            />
          </View>
          <Text style={styles.cardDescription}>
            Optimizes location updates for smoother tracking
          </Text>
        </View>

        {/* Card: Location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          {currentLocation ? (
            <View>
              <Text style={styles.locationTextLat}>{`Lat: ${currentLocation.latitude}`}</Text>
              <Text style={styles.locationTextLon}>{`Lon: ${currentLocation.longitude}`}</Text>
            </View>
          ) : (
            <Text style={styles.locationTextLat}>No location</Text>
          )}
        </View>

        {/* Card: Speed */}
        <View style={[styles.card, styles.speedCardRow]}>
          <View style={styles.speedCardCol}>
            <Text style={styles.cardTitle}>Speed</Text>
            <Text style={styles.metricValue}>{(speed * 3.6).toFixed(2)}</Text>
            <Text style={styles.metricUnit}>km/h</Text>
            <Text style={styles.metricMax}>Max: {(maxSpeed * 3.6).toFixed(2)} km/h</Text>
          </View>
          <View style={styles.speedCardCol}>
            <Text style={[styles.cardTitle, styles.speedCardCalculatedSpeed]}>Calculated Speed</Text>
            <Text style={styles.metricValue}>{(calculatedSpeed * 3.6).toFixed(2)}</Text>
            <Text style={styles.metricUnit}>km/h</Text>
            <Text style={styles.metricMax}>Max: {(maxCalculatedSpeed * 3.6).toFixed(2)} km/h</Text>
          </View>
        </View>

        {/* Card: Motion */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Motion</Text>
          <Text style={styles.motionRow}>
            Acceleration: <Text style={styles.motionValue}>{acceleration.toFixed(2)}</Text> m/s²
          </Text>
          <Text style={styles.motionRow}>
            Accuracy:
            <Text
              style={[
                styles.motionValue,
                { color: getAccuracyColor(currentAccuracy) },
              ]}
            >
              {currentAccuracy != null ? ' ' + currentAccuracy.toFixed(1) + ' m radius' : '--'}
            </Text>

            {currentAccuracy != null && (
              <Text style={{ color: getAccuracyColor(currentAccuracy), fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
                {' '}- {getAccuracyLabel(currentAccuracy)}
              </Text>
            )}
          </Text>
        </View>

        {/* Reset Button */}
        <View style={styles.resetContainer}>
          <Text style={styles.resetText} onPress={handleReset}>Reset</Text>
        </View>
      </ScrollView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingVertical: 24,
    paddingHorizontal: 0,
    backgroundColor: '#23272f',
    minHeight: '100%',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: 25,
    paddingTop: 35,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingRight: 5,
  },
  statusBadge: {
    backgroundColor: '#71EECE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    color: '#0a0a0aff',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#2d323c',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '500',
    marginBottom: 6,
  },
  cardDescription: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 2,
    fontWeight: '400',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  locationTextLat: {
    color: '#fff',
    fontSize: 18,
    marginTop: 5,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  locationTextLon: {
    color: '#fff',
    fontSize: 18,
    marginTop: 2,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  speedCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  speedCardCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedCardCalculatedSpeed: {
    fontSize: 20,
  },
  metricValue: {
    color: '#22d3ee',
    fontSize: 42,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 0,
    letterSpacing: 1,
  },
  metricUnit: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metricMax: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  motionRow: {
    color: '#94a3b8',
    fontSize: 18,
    marginTop: 2,
    fontWeight: '400',
  },
  motionValue: {
    color: '#22d3ee',
    fontWeight: '700',
    fontSize: 18,
  },
  resetContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  resetText: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#334155',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    overflow: 'hidden',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default App;
