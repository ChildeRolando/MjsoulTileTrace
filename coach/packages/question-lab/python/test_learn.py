import importlib.util
import pathlib
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("lab_learn", pathlib.Path(__file__).with_name("learn.py"))
learn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learn)


class BoundaryTests(unittest.TestCase):
    def request(self):
        samples, labels = [], []
        for group in range(40):
            for variant in range(4):
                x = (group % 10 - 4.5) + variant * .03
                sid = f"{group}-{variant}"
                samples.append({"sampleId": sid, "groupId": str(group), "split": "test" if group >= 30 else "train",
                                "features": {"x": x, "noise": group % 3},
                                "hypotheses": [{"id": "a", "applicable": True, "actionRefs": ["a"]}]})
                labels.append({"sampleId": sid, "preferredActionRefs": ["a" if x > 0 else "b"]})
        return {"samples": samples, "labels": labels, "hypotheses": [{"id": "a"}],
                "options": {"features": ["x", "noise"], "minClassSamples": 5, "minGroups": 10}, "evaluate": True}

    def test_known_boundary_generalizes_and_prefers_linear(self):
        result = learn.fit(self.request())
        task = result["tasks"]["a"]
        self.assertEqual(task["status"], "fitted")
        self.assertEqual(task["selected"]["kernel"], "linear")
        self.assertGreater(task["holdout"]["balancedAccuracy"], .95)
        self.assertGreater(task["explanation"]["holdoutFidelity"], .95)
        self.assertGreater(len(task["explanation"]["boundaryPairs"]), 0)
        near = learn.evaluate_serialized(task["model"], [[0, 1]])[0]
        far = learn.evaluate_serialized(task["model"], [[4, 1]])[0]
        self.assertLess(near, far)

    def test_holdout_labels_cannot_change_fitted_boundary(self):
        request = self.request()
        request["evaluate"] = False
        first = learn.fit(request)["tasks"]["a"]
        for label in request["labels"]:
            if int(label["sampleId"].split("-")[0]) >= 30:
                label["preferredActionRefs"] = ["invented"]
        second = learn.fit(request)["tasks"]["a"]
        self.assertEqual(first, second)

    def test_single_class_has_no_fabricated_boundary(self):
        request = self.request()
        for label in request["labels"]:
            label["preferredActionRefs"] = ["a"]
        self.assertEqual(learn.fit(request)["status"], "insufficient_evidence")

    def test_small_multiclass_has_insufficient_evidence_instead_of_cv_exception(self):
        rows = [({"groupId": str(i), "split": "train", "features": {"x": i}}, str(i // 2)) for i in range(6)]
        result = learn.fit_task(rows, ["x"], {"minClassSamples": 2, "minGroups": 5}, False)
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(result["reason"], "grouped_cv_requires_three_per_class")


if __name__ == "__main__":
    unittest.main()
