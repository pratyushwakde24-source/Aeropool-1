import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/views/AdminDashboardView.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const target = `            </div>
          </div>
        )}
      </div>`;

const replacement = `            </div>
          </div>
        )}

        {/* TAB 7: MAP PROVIDER ENGINE (PHASE 3) */}
        {activeTab === 'maps' && (
          <MapProviderSettingsCard
            onNotify={(type, msg) => setDispatchFeedback({ type: type === 'info' ? 'success' : type, message: msg })}
          />
        )}
      </div>`;

// Try CRLF first
const crlfTarget = target.replace(/\n/g, '\r\n');
const crlfReplacement = replacement.replace(/\n/g, '\r\n');

if (content.includes(crlfTarget)) {
  content = content.replace(crlfTarget, crlfReplacement);
  console.log('Successfully replaced CRLF target!');
} else if (content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('Successfully replaced LF target!');
} else {
  console.error('Target not found!');
}

fs.writeFileSync(filePath, content, 'utf-8');
