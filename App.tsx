import { StatusBar, StyleSheet, useColorScheme, View, Text, Button, Platform, PermissionsAndroid, Alert } from 'react-native';
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef, use } from 'react';
import GetLocation, {
  Location,
  isLocationError,
} from 'react-native-get-location'

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [previousLocation, setPreviousLocation] = useState<Location | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [acceleration, setAcceleration] = useState<number | null>(null);
  const requestingRef = useRef(false);

  useEffect(() => {
    getCurrentLocation();
    const interval = setInterval(() => {
      getCurrentLocation();
    }, 1000)
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (currentLocation && previousLocation) {
      const distance = calculateDistannce(previousLocation.latitude, previousLocation.longitude, currentLocation.latitude, currentLocation.longitude);
      const timeDiff = (currentLocation.time - previousLocation.time) / 1000; // in seconds
      if (timeDiff > 0) {
        const speedValue = distance / timeDiff; // in m/s
        const acc = speedValue / timeDiff; // in m/s²
        setAcceleration(acc);
        setSpeed(speedValue);
      }
    }
    if (currentLocation) {
      setPreviousLocation(currentLocation);
    }
  }, [currentLocation]);
  const getCurrentLocation = async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    console.log('function called');
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
        timeout: 60000,
      });
      setCurrentLocation(location);


    } catch (error) {
      if (isLocationError(error)) {
        console.warn('Location error', error.code, error.message);
      }
    }
    finally {
      requestingRef.current = false;
    }
  };

  const toRedian = (degree: number) => {
    return degree * (Math.PI / 180);
  };

  const calculateDistannce = (lat1, lon1, lat2, lon2) => {
    const Radious = 6371000;
    lat1 = Number(lat1.toFixed(5));
    lon1 = Number(lon1.toFixed(5));
    lat2 = Number(lat2.toFixed(5));
    lon2 = Number(lon2.toFixed(5));
    const dLat = toRedian(lat2 - lat1);
    const dLon = toRedian(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRedian(lat1)) * Math.cos(toRedian(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = Radious * c;
    return distance; // distance in meters
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        <Text style={styles.textStyle}>Gps</Text>
        <View style={styles.coordinateStyle}>
          <Text> Cureent location </Text>
          {currentLocation ? (
            <Text style={styles.textStyle}>{`Lat: ${currentLocation.latitude}\nLon: ${currentLocation.longitude}`}</Text>
          ) : (
            <Text style={styles.textStyle}>No location</Text>
          )}
        </View>
        <View style={styles.coordinateStyle}>
          <Text> Previous Location </Text>
          {previousLocation ? (
            <Text style={styles.textStyle}>{`Lat: ${previousLocation.latitude}\nLon: ${previousLocation.longitude}`}</Text>
          ) : (
            <Text style={styles.textStyle}>No location</Text>
          )}
        </View>
        <View style={styles.coordinateStyle}>
          <Text> Altitude </Text>
          {currentLocation ? (<Text style={styles.textStyle}>{currentLocation.altitude.toFixed(1)}</Text>) : null}
        </View>
        <View style={styles.coordinateStyle}>
          <Text> Speed </Text>
          {speed ? (
            <Text style={styles.textStyle}>{(speed * 3.6).toFixed(2)}</Text>
          ) : (
            <Text style={styles.textStyle}>{'inProgress'}</Text>
          )}
          <Text> Acceleration </Text>
          {
            acceleration ? (
              <Text style={styles.textStyle}>{acceleration.toFixed(1)}</Text>)
              :
              <Text style={styles.textStyle}>{0}</Text>
          }
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
  },
  textStyle: {
    color: '#fff',
    fontSize: 22,
  },
  coordinateStyle: {

  },
});

export default App;
