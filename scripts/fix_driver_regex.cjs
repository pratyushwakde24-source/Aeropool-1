const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf8');

code = code.replace(/assignedDriverId:\s*availableDriver\.id/g, 'assignedDriverId: availableDriver?.id');
code = code.replace(/assignedDriverName:\s*availableDriver\.fullName/g, 'assignedDriverName: availableDriver?.fullName');
code = code.replace(/assignedDriverPhone:\s*availableDriver\.phone/g, 'assignedDriverPhone: availableDriver?.phone');
code = code.replace(/assignedDriverRating:\s*availableDriver\.rating/g, 'assignedDriverRating: availableDriver?.rating');
code = code.replace(/vehicleModel:\s*availableDriver\.assignedVehicle/g, 'vehicleModel: availableDriver?.assignedVehicle');
code = code.replace(/vehiclePlate:\s*availableDriver\.assignedVehicle/g, 'vehiclePlate: availableDriver?.assignedVehicle');

fs.writeFileSync('src/services/db.ts', code, 'utf8');
console.log('Fixed driver optional chaining via regex in src/services/db.ts');
