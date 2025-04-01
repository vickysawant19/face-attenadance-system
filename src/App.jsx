import { useState } from "react";

import FaceAttendance from "./face-attendance/FaceAttendance";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <FaceAttendance />
    </div>
  );
}

export default App;
