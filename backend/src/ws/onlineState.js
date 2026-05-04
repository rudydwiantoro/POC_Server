const onlineDevices = new Set();

function setDeviceOnline(deviceId) {
  if (!deviceId) return;
  onlineDevices.add(deviceId);
}

function setDeviceOffline(deviceId) {
  if (!deviceId) return;
  onlineDevices.delete(deviceId);
}

function getOnlineDeviceCount() {
  return onlineDevices.size;
}

function isDeviceOnline(deviceId) {
  return onlineDevices.has(deviceId);
}

module.exports = { setDeviceOnline, setDeviceOffline, getOnlineDeviceCount, isDeviceOnline };
