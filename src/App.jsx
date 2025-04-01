import { useState } from "react";

import FaceAttendance from "./FaceAttendance";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <FaceAttendance />
    </div>
  );
}

export default App;
