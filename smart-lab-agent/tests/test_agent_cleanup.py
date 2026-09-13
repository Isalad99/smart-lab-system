import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent_cleanup import CleanupReport, SessionCleanupManager


class SessionCleanupFileTests(unittest.TestCase):
    def test_chromium_cleanup_keeps_bookmarks_and_extensions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "Chrome" / "User Data"
            profile = root / "Default"
            profile.mkdir(parents=True)
            (profile / "Bookmarks").write_text("{}", encoding="utf-8")
            (profile / "History").write_text("history", encoding="utf-8")
            (profile / "Extensions").mkdir()
            (profile / "Extensions" / "extension.txt").write_text(
                "keep",
                encoding="utf-8",
            )
            (profile / "Network").mkdir()
            (profile / "Network" / "Cookies").write_text(
                "cookies",
                encoding="utf-8",
            )

            manager = SessionCleanupManager(
                protected_pid=0,
                chromium_roots=[root],
                firefox_roots=[],
                download_roots=[],
            )
            report = CleanupReport()
            manager.clear_browser_data(report)

            self.assertTrue((profile / "Bookmarks").is_file())
            self.assertTrue((profile / "Extensions" / "extension.txt").is_file())
            self.assertFalse((profile / "History").exists())
            self.assertFalse((profile / "Network" / "Cookies").exists())
            self.assertGreaterEqual(report.removed_browser_items, 2)

    def test_firefox_cleanup_removes_history_but_keeps_bookmarked_place(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "Firefox" / "Profiles"
            profile = root / "test.default"
            profile.mkdir(parents=True)
            places_path = profile / "places.sqlite"
            connection = sqlite3.connect(places_path)
            try:
                connection.executescript(
                    """
                    CREATE TABLE moz_places (
                        id INTEGER PRIMARY KEY,
                        url TEXT NOT NULL
                    );
                    CREATE TABLE moz_bookmarks (
                        id INTEGER PRIMARY KEY,
                        fk INTEGER
                    );
                    CREATE TABLE moz_historyvisits (
                        id INTEGER PRIMARY KEY,
                        place_id INTEGER
                    );
                    CREATE TABLE moz_inputhistory (
                        place_id INTEGER,
                        input TEXT
                    );
                    INSERT INTO moz_places (id, url)
                    VALUES (1, 'https://bookmarked.example'),
                           (2, 'https://history.example');
                    INSERT INTO moz_bookmarks (id, fk) VALUES (1, 1);
                    INSERT INTO moz_historyvisits (id, place_id)
                    VALUES (1, 1), (2, 2);
                    INSERT INTO moz_inputhistory (place_id, input)
                    VALUES (2, 'history');
                    """
                )
                connection.commit()
            finally:
                connection.close()
            (profile / "logins.json").write_text("login", encoding="utf-8")

            manager = SessionCleanupManager(
                protected_pid=0,
                chromium_roots=[],
                firefox_roots=[root],
                download_roots=[],
            )
            report = CleanupReport()
            manager.clear_browser_data(report)

            connection = sqlite3.connect(places_path)
            try:
                place_ids = {
                    row[0]
                    for row in connection.execute("SELECT id FROM moz_places")
                }
                visit_count = connection.execute(
                    "SELECT COUNT(*) FROM moz_historyvisits"
                ).fetchone()[0]
            finally:
                connection.close()

            self.assertEqual(place_ids, {1})
            self.assertEqual(visit_count, 0)
            self.assertFalse((profile / "logins.json").exists())
            self.assertGreaterEqual(report.removed_browser_items, 1)

    def test_only_downloads_created_after_session_start_are_removed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            downloads = Path(temp_dir) / "Downloads"
            downloads.mkdir()
            old_file = downloads / "old.txt"
            old_file.write_text("keep", encoding="utf-8")

            manager = SessionCleanupManager(
                protected_pid=0,
                chromium_roots=[],
                firefox_roots=[],
                download_roots=[downloads],
            )
            new_folder = downloads / "new-folder"
            new_folder.mkdir()
            new_file = new_folder / "new.txt"
            new_file.write_text("remove", encoding="utf-8")
            report = CleanupReport()

            manager.clear_new_downloads(report)

            self.assertTrue(old_file.is_file())
            self.assertFalse(new_file.exists())
            self.assertEqual(report.removed_downloads, 1)


if __name__ == "__main__":
    unittest.main()
