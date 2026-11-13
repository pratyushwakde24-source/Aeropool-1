const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf8');

code = code.replace(
  `      assignedDriverId: availableDriver.id,
      assignedDriverName: availableDriver.fullName,
      assignedDriverPhone: availableDriver.phone,
      assignedDriverRating: availableDriver.rating,`,
  `      assignedDriverId: availableDriver?.id,
      assignedDriverName: availableDriver?.fullName,
      assignedDriverPhone: availableDriver?.phone,
      assignedDriverRating: availableDriver?.rating,`
);

fs.writeFileSync('src/services/db.ts', code, 'utf8');
console.log('Fixed driver optional chaining in createPoolAndBookAtomic');
