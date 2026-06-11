import argparse

import cv2
import onnxruntime as ort
import numpy as np




def get_args():
    parser = argparse.ArgumentParser(description="Train CNN model")
    parser.add_argument("--image_path", "-b", type=str, default="../image/test/test_0.jpg")
    parser.add_argument(
        "--onnx_path", "-c", type=str, default="trained_models_fs/keypoints_onnx_32.onnx"
    )

    args = parser.parse_args()
    return args

def onnx_inference_image(onnx_path,img):
    session=ort.InferenceSession(onnx_path,
                                 providers=['CPUExecutionProvider'])
    output=session.run([], {'input':img})
    return output

def error_visualization(img, boxes, color=(0, 255, 0)):
    img_bbox = img.copy()
    try:
        boxes = boxes.astype("int")
        for i, box in enumerate(boxes):
            cv2.rectangle(img_bbox, (box[0], box[1]), (box[2], box[3]), color, 4)
    except:
        print("No Face Detected in the image\n")

    return img_bbox



def nms_cv2(boxes, scores, iou_threshold=0.3, score_threshold=0.0):
    # cv2 cần format [x, y, w, h]
    boxes_xywh = [[b[0], b[1], b[2] - b[0], b[3] - b[1]] for b in boxes]

    indices = cv2.dnn.NMSBoxes(
        boxes_xywh,
        scores.tolist(),
        score_threshold=score_threshold,
        nms_threshold=iou_threshold,
    )

    if len(indices) == 0:
        return []
    return indices.flatten().tolist()

def rectangle_result(image, first_target, secon_target=None, isfind=True):
    len_first_target = len(first_target["boxes"])
    if isfind and secon_target is not None:
        label =  int(secon_target["labels"][0])

        boxes = [first_target["boxes"][i] for i in range(len_first_target) if first_target["labels"][i] == label]
        scores = [first_target["scores"][i] for i in range(len_first_target) if first_target["labels"][i] == label]
    else:
        boxes = [
            first_target["boxes"][i]
            for i in range(len_first_target)
        ]
        scores = [
            first_target["scores"][i]
            for i in range(len_first_target)
        ]
    for bbox, score in zip(boxes, scores):
        [x_min, y_min, x_max, y_max] = bbox
        cv2.rectangle(image, (x_min, y_min), (x_max, y_max), (255, 0, 0), 2)
        cv2.putText(
            image,
            f"""{score:.2f}""",
            (x_min, y_min),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            2,
        )

    return image

def detect_symbols_with_onnx(image, onnx_path = "trained_models_fs/keypoints_onnx_32.onnx"):
    classes = [
        "capacitor",
        "current_source",
        "ac_current",
        "voltage_source",
        "inductor",
        "resistor",
        "ground",
        "dependant_current",
        "dependant_voltage",
        "transistor",
        "diode",
        "mosfet",
        "switch",
        "transformer",
        "led",
        "potentiometer",
        "schottky_zener_diode",
        "thermistor",
        "variable_resistor",
        "motor",
        "operational_amplifier",
        "amplifier",
        "crystal",
        "fuse",
        "generator",
        "ldr",
        "light",
        "microphone",
        "nand_gate",
        "nor_gate",
        "and_gate",
        "or_gate",
        "xnor_gate",
        "xor_gate",
        "not_gate",
        "npn_transistor",
        "pnp_transistor",
        "capacitor_polarized",
        "iron_core_inductor",
        "antenna",
        "speaker",
        "buzzer",
        "variable_capacitor",
        "connector",
        "heating_element",
        "unknown",
        "7_segments",
        "amperimeter",
        "galvanometer",
        "volt",
        "voltimeter",
        "wattimeter",
        "box",
        "clock",
        "electric_bell",
        "frequency_meter",
        "magnetron",
        "not_duplicate",
        "ohmmeter",
    ]


    h, w = image.shape[0], image.shape[1]
    reshaped_image = cv2.resize(image, (512, 512))
    reshaped_image = cv2.cvtColor(reshaped_image, cv2.COLOR_BGR2RGB)
    reshaped_image = (np.transpose(reshaped_image, (2, 0, 1)).astype(dtype=np.float32)) / 255.0

    prediction = onnx_inference_image(onnx_path, reshaped_image[np.newaxis,...])

    list_bbox_reshape = prediction[0].astype("int")
    list_bbox = [
        [
            int(bbox_reshape[0]*w/512),
            int(bbox_reshape[1]*h/512),
            int(bbox_reshape[2]*w/512),
            int(bbox_reshape[3]*h/512),
        ]
        for bbox_reshape in list_bbox_reshape
    ]

    list_label = prediction[1].astype("int")
    list_score = prediction[2].astype("float")

    # Non-maximum Suppression
    keep_indices = nms_cv2(list_bbox, np.array(list_score), iou_threshold=0.3)


    boxes = [list_bbox[index] for index in keep_indices]
    labels = [list_label[index] for index in keep_indices]
    scores = [list_score[index] for index in keep_indices]
    targets ={
        "boxes": boxes,
        "labels": labels,
        "scores": scores,
    }



    return image, targets

def onnx_inference(image, onnx_path):
    image_result, first_targets = detect_symbols_with_onnx(image, onnx_path)
    rectangle_image = rectangle_result(image_result, first_targets, isfind=False)
    return rectangle_image, first_targets


