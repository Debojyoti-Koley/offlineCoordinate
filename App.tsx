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

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [speed, setSpeed] = useState<number>(0); // m/s
  const [acceleration, setAcceleration] = useState<number>(0); // m/s²
  const [altitude, setAltitude] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [calculatedSpeed, setCalculatedSpeed] = useState<number>(0); // m/s

  const requestingRef = useRef(false);
  const prevSpeedRef = useRef(0);
  const prevLocationRef = useRef<Location | null>(null);

  useEffect(() => {
    getCurrentLocation();
    const interval = setInterval(() => getCurrentLocation(), 2000);
    return () => clearInterval(interval);
  }, []);

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
        timeout: 8000,
      });

      if (location.accuracy != null) {
        setCurrentAccuracy(location.accuracy);
      }

      if (location.altitude != null) {
        setAltitude(location.altitude);
      }

      // Filter bad GPS accuracy
      if (location.accuracy != null && location.accuracy > 15) {
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

    lat1 = Number(lat1.toFixed(5));
    lon1 = Number(lon1.toFixed(5));
    lat2 = Number(lat2.toFixed(5));
    lon2 = Number(lon2.toFixed(5));

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        <Text style={styles.textStyle}>GPS</Text>

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
});

export default App;

