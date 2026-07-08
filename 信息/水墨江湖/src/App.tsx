/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  PlayerInfo, TopBar, QuestPanel, RightPanel, 
  BottomPanel, CenterTitle, BottomLeftArea 
} from "./components/WuxiaUI";

export default function App() {
  return (
    <div 
      className="relative w-full h-screen bg-[#111] overflow-hidden font-wuxia bg-cover bg-center select-none"
      style={{ backgroundImage: `url('/wuxia-sprites/bg.jpg')` }}
    >
      {/* Top Left */}
      <div className="absolute top-6 left-6">
        <PlayerInfo />
      </div>

      {/* Top Right */}
      <div className="absolute top-6 right-6">
        <TopBar />
      </div>

      {/* Left Panel */}
      <div className="absolute top-28 left-6">
        <QuestPanel />
      </div>

      {/* Right Panel */}
      <div className="absolute top-28 right-6">
        <RightPanel />
      </div>

      {/* Center Background Title */}
      <div className="absolute top-1/4 right-[35%] pointer-events-none transform -translate-x-1/2 mix-blend-multiply opacity-80">
        <CenterTitle />
      </div>

      {/* Bottom Left: Chat, Joystick, Mount */}
      <BottomLeftArea />

      {/* Bottom Right */}
      <div className="absolute bottom-6 right-6">
        <BottomPanel />
      </div>
    </div>
  );
}
