"""
PANNs SED (Sound Event Detection) Engine
基于 panns-inference 或 torch hub 的音频事件检测引擎
输出帧级 527-class AudioSet 标签概率，合并为时间段
"""

import os
import sys
import json
import math
import tempfile
import warnings
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import numpy as np
import torch
import torch.nn.functional as F

# 尝试多种方式加载 PANNs 模型
try:
    from panns_inference import AudioTagging, SoundEventDetection, labels
    PANNS_PACKAGE_AVAILABLE = True
except ImportError:
    PANNS_PACKAGE_AVAILABLE = False

# AudioSet 527 标签（精简版，用于 torch hub fallback）
# 完整标签会在模型加载后从模型元数据获取
AUDIOSET_LABELS = [
    "Speech", "Male speech, man speaking", "Female speech, woman speaking",
    "Child speech, kid speaking", "Conversation", "Narration, monologue",
    "Babbling", "Speech synthesizer", "Shout", "Bellow", "Whoop", "Yell",
    "Battle cry", "Children shouting", "Screaming", "Whispering", "Laughter",
    "Baby laughter", "Giggle", "Snicker", "Belly laugh", "Chuckle, chortle",
    "Crying, sobbing", "Baby cry, infant cry", "Whimper", "Wail, moan",
    "Sigh", "Singing", "Choir", "Yodeling", "Hubbub, speech noise, speech babble",
    "Crowd", "Cheering", "Applause", "Chant", "Children playing",
    "Animal", "Domestic animals, pets", "Dog", "Bark", "Yip", "Howl",
    "Bow-wow", "Growling", "Cat", "Purr", "Meow", "Hiss", "Caterwauling",
    "Livestock, farm animals, working animals", "Horse", "Clip-clop",
    "Neigh, whinny", "Cattle, bovinae", "Moo", "Cowbell", "Pig", "Oink",
    "Goat", "Bleat", "Sheep", "Fowl", "Chicken, rooster", "Cluck",
    "Crowing, cock-a-doodle-doo", "Turkey", "Gobble", "Duck", "Quack",
    "Goose", "Honk", "Wild animals", "Roaring cats (lions, tigers)",
    "Roar", "Bird", "Bird vocalization, bird call, bird song", "Chirp, tweet",
    "Squawk", "Pigeon, dove", "Coo", "Crow", "Caw", "Owl", "Hoot",
    "Bird flight, flapping wings", "Canidae, dogs, wolves", "Rodents, rats, mice",
    "Mouse", "Patter", "Insect", "Cricket", "Mosquito", "Fly, housefly",
    "Buzz", "Bee, wasp, etc.", "Frog", "Croak", "Snake", "Hiss",
    "Whale vocalization", "Music", "Musical instrument", "Plucked string instrument",
    "Guitar", "Electric guitar", "Bass guitar", "Acoustic guitar",
    "Steel guitar, slide guitar", "Tapping (guitar technique)", "Strum",
    "Banjo", "Sitar", "Mandolin", "Zither", "Ukulele", "Keyboard (musical)",
    "Piano", "Electric piano", "Organ", "Electronic organ", "Hammond organ",
    "Synthesizer", "Sampler", "Harpsichord", "Percussion", "Drum kit",
    "Drum machine", "Drum", "Snare drum", "Rimshot", "Drum roll",
    "Bass drum", "Timpani", "Tabla", "Cymbal", "Hi-hat", "Wood block",
    "Tambourine", "Rattle (instrument)", "Maraca", "Gong", "Tubular bells",
    "Mallet percussion", "Marimba, xylophone", "Glockenspiel", "Vibraphone",
    "Orchestra", "Brass instrument", "French horn", "Trumpet", "Trombone",
    "Bowed string instrument", "String section", "Violin, fiddle",
    "Pizzicato", "Cello", "Double bass", "Wind instrument, woodwind instrument",
    "Flute", "Saxophone", "Clarinet", "Harp", "Bell", "Church bell",
    "Jingle bell", "Bicycle bell", "Tuning fork", "Chime", "Wind chime",
    "Change ringing (campanology)", "Harmonica", "Accordion", "Bagpipes",
    "Didgeridoo", "Shofar", "Theremin", "Singing bowl", "Scratching (performance technique)",
    "Pop music", "Hip hop music", "Rock music", "Heavy metal", "Punk rock",
    "Grunge", "Progressive rock", "Rock and roll", "Psychedelic rock",
    "Rhythm and blues", "Soul music", "Reggae", "Country", "Swing music",
    "Bluegrass", "Funk", "Folk music", "Middle Eastern music", "Jazz",
    "Disco", "Classical music", "Opera", "Electronic music", "House music",
    "Techno", "Dubstep", "Drum and bass", "Electronica", "Electronic dance music",
    "Ambient music", "Trance music", "Music of Latin America", "Salsa music",
    "Flamenco", "Blues", "Music for children", "New-age music", "Vocal music",
    "A capella", "Music of Africa", "Afrobeat", "Christian music", "Gospel music",
    "Music of Asia", "Carnatic music", "Music of Bollywood", "Ska", "Traditional music",
    "Independent music", "Song", "Background music", "Theme music", "Jingle (music)",
    "Soundtrack music", "Lullaby", "Video game music", "Christmas music",
    "Dance music", "Wedding music", "Happy music", "Sad music", "Tender music",
    "Exciting music", "Angry music", "Scary music", "Wind", "Rustling leaves",
    "Wind noise (microphone)", "Thunderstorm", "Thunder", "Water", "Rain",
    "Raindrop", "Rain on surface", "Stream", "Waterfall", "Ocean", "Waves, surf",
    "Steam", "Gurgling", "Fire", "Crackle", "Vehicle", "Boat, Water vehicle",
    "Sailboat, sailing ship", "Rowboat, canoe, kayak", "Motorboat, speedboat",
    "Ship", "Motor vehicle (road)", "Car", "Vehicle horn, car horn, honking",
    "Toot", "Car alarm", "Power windows, electric windows", "Skidding",
    "Tire squeal", "Car passing by", "Race car, auto racing", "Truck",
    "Air brake", "Air horn, truck horn", "Reversing beeps", "Ice cream truck, van",
    "Bus", "Emergency vehicle", "Police car (siren)", "Ambulance (siren)",
    "Fire engine, fire truck (siren)", "Motorcycle", "Traffic noise, roadway noise",
    "Rail transport", "Train", "Train whistle", "Train horn", "Railroad car, train wagon",
    "Subway, metro, underground", "Aircraft", "Aircraft engine", "Jet engine",
    "Propeller, airscrew", "Helicopter", "Fixed-wing aircraft, airplane",
    "Bicycle", "Skateboard", "Engine", "Light engine (high frequency)",
    "Dental drill, dentist's drill", "Lawn mower", "Chainsaw", "Medium engine (mid frequency)",
    "Heavy engine (low frequency)", "Engine knocking", "Engine starting",
    "Idling", "Accelerating, revving, vroom", "Door", "Doorbell",
    "Ding-dong", "Sliding door", "Slam", "Knock", "Tap", "Squeak",
    "Cupboard open or close", "Drawer open or close", "Dishes, pots, and pans",
    "Cutlery, silverware", "Chopping (food)", "Frying (food)", "Microwave oven",
    "Blender", "Water tap, faucet", "Sink (filling or washing)", "Bathtub (filling or washing)",
    "Hair dryer", "Toilet flush", "Toothbrush", "Electric toothbrush", "Vacuum cleaner",
    "Clock", "Tick", "Tick-tock", "Alarm", "Alarm clock", "Siren",
    "Civil defense siren", "Police siren", "Fire alarm", "Smoke detector, smoke alarm",
    "Foghorn", "Whistle", "Steam whistle", "Mechanisms", "Ratchet, pawl",
    "Clockwork", "Popping", "Clicking", "Clickety-clack", "Rumble",
    "Buzzer", "Bleep", "Chink, clink", "Clang", "Snap", "Crack", "Glass",
    "Chatter", "Whir", "Clatter", "Thump, thud", "Thud", "Clunk",
    "Banging", "Sliding", "Roll", "Crushing", "Crumpling, crinkling",
    "Tearing", "Scrape", "Rub", "Grind", "Rolling", "Impact", "Hammer",
    "Power tool", "Drill", "Explosion", "Gunshot, gunfire", "Machine gun",
    "Fusillade", "Artillery fire", "Cap gun", "Fireworks", "Firecracker",
    "Burst, pop", "Eruption", "Boom", "Wood", "Chop", "Splinter", "Crack",
    "Glass", "Chink, clink", "Shatter", "Liquid", "Splash, splatter",
    "Squish", "Drip", "Pour", "Trickle, dribble", "Gush", "Fill (with liquid)",
    "Spray", "Environmental noise", "Silence", "Sine wave", "Harmonic",
    "Chirp tone", "Sound effect", "Pulse", "Inside, small room", "Inside, large room or hall",
    "Inside, public space", "Outside, urban or manmade", "Outside, rural or natural",
    "Reverberation", "Echo", "Noise", "Environmental noise", "Static",
    "Mains hum", "Distortion", "Sidechain", "Microphone", "Radio",
    "Television", "Field recording",
]

# 加载完整的 AudioSet 标签映射
def load_audioset_labels() -> List[str]:
    """尝试从多个来源加载 527 个 AudioSet 标签"""
    if PANNS_PACKAGE_AVAILABLE:
        try:
            return labels
        except Exception:
            pass
    # fallback: 使用内置列表 + 填充
    labels_copy = list(AUDIOSET_LABELS)
    while len(labels_copy) < 527:
        labels_copy.append(f"Class_{len(labels_copy)}")
    return labels_copy[:527]


class PannsEngine:
    """PANNs SED 引擎：帧级事件检测 + 时间段合并"""

    _instance: Optional["PannsEngine"] = None
    _initialized: bool = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        model_name: str = "Cnn14_DecisionLevelMax",
        device: Optional[str] = None,
        checkpoint_path: Optional[str] = None,
    ):
        if PannsEngine._initialized:
            return
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.checkpoint_path = checkpoint_path
        self.model = None
        self.labels: List[str] = load_audioset_labels()
        self.sample_rate = 32000
        self.clip_duration = 10.0
        self.hop_duration = 0.5  # SED 帧移（秒）
        self._model_loaded = False
        PannsEngine._initialized = True

    def load(self) -> bool:
        """懒加载模型"""
        if self._model_loaded:
            return True
        try:
            if PANNS_PACKAGE_AVAILABLE:
                self._load_via_panns_inference()
            else:
                self._load_via_torch_hub()
            self._model_loaded = True
            print(f"[PANNs] Model loaded on {self.device}")
            return True
        except Exception as e:
            print(f"[PANNs] Failed to load model: {e}")
            return False

    def _load_via_panns_inference(self):
        """通过 panns-inference 包加载"""
        self.sed = SoundEventDetection(
            checkpoint_path=self.checkpoint_path,
            device=self.device,
        )
        self.model = self.sed.model
        # 更新标签
        if hasattr(self.sed, "labels") and self.sed.labels:
            self.labels = self.sed.labels

    def _load_via_torch_hub(self):
        """通过 torch hub 加载 PANNs 模型作为 fallback"""
        # torch hub 加载 panns 模型
        model = torch.hub.load(
            "qiuqiangkong/audioset_tagging_cnn",
            self.model_name,
            pretrained=True,
            force_reload=False,
        )
        model.to(self.device)
        model.eval()
        self.model = model

    def _load_audio(self, file_path: str) -> Tuple[np.ndarray, float]:
        """加载音频并返回 (waveform, duration)"""
        try:
            import librosa
            waveform, sr = librosa.load(file_path, sr=self.sample_rate, mono=True)
        except Exception:
            # ffmpeg fallback
            import soundfile as sf
            import subprocess
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", file_path,
                        "-ar", str(self.sample_rate), "-ac", "1",
                        "-acodec", "pcm_f32le", tmp_path,
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                waveform, sr = sf.read(tmp_path, dtype="float32")
                if waveform.ndim > 1:
                    waveform = waveform.mean(axis=1)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        duration = len(waveform) / self.sample_rate
        return waveform.astype(np.float32), float(duration)

    def _preprocess(self, waveform: np.ndarray) -> torch.Tensor:
        """将波形转换为模型输入（mel spectrogram）"""
        # 使用 librosa 计算 mel spectrogram
        try:
            import librosa
            mel_spec = librosa.feature.melspectrogram(
                y=waveform,
                sr=self.sample_rate,
                n_fft=2048,
                hop_length=512,
                n_mels=64,
                fmin=50,
                fmax=14000,
            )
            log_mel = librosa.power_to_db(mel_spec, ref=1.0)
            # 转换为 (batch, freq, time)
            x = torch.from_numpy(log_mel).unsqueeze(0).float().to(self.device)
            return x
        except Exception as e:
            raise RuntimeError(f"Failed to compute mel spectrogram: {e}")

    def _run_sed(self, waveform: np.ndarray) -> np.ndarray:
        """
        运行 SED，返回帧级概率 (n_frames, 527)
        """
        if not self._model_loaded and not self.load():
            raise RuntimeError("PANNs model not loaded")

        # 如果通过 panns-inference 加载，使用其接口
        if PANNS_PACKAGE_AVAILABLE and hasattr(self, "sed"):
            # panns-inference 的 SoundEventDetection 接受文件路径
            # 但这里我们已经有 waveform，需要临时保存
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                import soundfile as sf
                sf.write(tmp_path, waveform, self.sample_rate)
                framewise_output = self.sed.inference(audio_path=tmp_path)
                # framewise_output shape: (batch, n_frames, 527)
                if isinstance(framewise_output, torch.Tensor):
                    framewise_output = framewise_output.cpu().numpy()
                return framewise_output[0]  # (n_frames, 527)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        else:
            # torch hub fallback: 手动前向传播
            x = self._preprocess(waveform)
            with torch.no_grad():
                # 不同模型输出格式不同
                output = self.model(x)
                if isinstance(output, dict):
                    framewise = output.get("framewise_output", output.get("clipwise_output"))
                elif isinstance(output, (tuple, list)):
                    framewise = output[0]
                else:
                    framewise = output
                # 确保是 (batch, n_frames, 527) 或 (batch, 527)
                if framewise.dim() == 2:
                    # clip-level，复制为帧级（退化情况）
                    framewise = framewise.unsqueeze(1)
                framewise = torch.sigmoid(framewise)
            return framewise[0].cpu().numpy()  # (n_frames, 527)

    def detect_events(
        self,
        file_path: str,
        threshold: float = 0.3,
        min_duration: float = 0.25,
        max_segments: int = 20,
    ) -> List[Dict]:
        """
        检测音频中的事件时间段

        Returns:
            List[{
                label: str,          # 英文标签
                display_label: str,  # 显示标签（可后续映射为中文）
                start_time: float,
                end_time: float,
                peak_prob: float,
            }]
        """
        waveform, duration = self._load_audio(file_path)

        # 如果音频过长，分段处理（PANNs 通常处理 10s clip）
        segment_duration = self.clip_duration
        all_segments: List[Dict] = []

        num_segments = max(1, math.ceil(duration / segment_duration))
        for seg_idx in range(num_segments):
            start_sample = int(seg_idx * segment_duration * self.sample_rate)
            end_sample = int(min((seg_idx + 1) * segment_duration, duration) * self.sample_rate)
            seg_waveform = waveform[start_sample:end_sample]

            if len(seg_waveform) < self.sample_rate * 0.5:
                continue  # 跳过太短片段

            # 运行 SED
            frame_probs = self._run_sed(seg_waveform)  # (n_frames, 527)

            # 计算每帧对应的时间
            n_frames = frame_probs.shape[0]
            seg_actual_duration = len(seg_waveform) / self.sample_rate
            frame_times = np.linspace(0, seg_actual_duration, n_frames, endpoint=False)

            # 对每个类别提取连续激活段
            seg_offset = seg_idx * segment_duration
            for class_idx in range(frame_probs.shape[1]):
                probs = frame_probs[:, class_idx]
                if probs.max() < threshold:
                    continue

                # 二值化
                active = probs >= threshold
                if not active.any():
                    continue

                # 提取连续段
                in_segment = False
                seg_start = 0
                for i, is_active in enumerate(active):
                    if is_active and not in_segment:
                        in_segment = True
                        seg_start = i
                    elif not is_active and in_segment:
                        in_segment = False
                        seg_end = i
                        self._add_segment(
                            all_segments,
                            class_idx,
                            frame_times,
                            probs,
                            seg_start,
                            seg_end,
                            seg_offset,
                            min_duration,
                        )
                if in_segment:
                    self._add_segment(
                        all_segments,
                        class_idx,
                        frame_times,
                        probs,
                        seg_start,
                        len(active),
                        seg_offset,
                        min_duration,
                    )

        # 按 peak_prob 排序，取前 N
        all_segments.sort(key=lambda x: x["peak_prob"], reverse=True)
        return all_segments[:max_segments]

    def _add_segment(
        self,
        segments: List[Dict],
        class_idx: int,
        frame_times: np.ndarray,
        probs: np.ndarray,
        start_idx: int,
        end_idx: int,
        time_offset: float,
        min_duration: float,
    ):
        start_time = float(frame_times[start_idx]) + time_offset
        end_time = float(frame_times[min(end_idx, len(frame_times) - 1)]) + time_offset
        if end_time <= start_time:
            end_time = start_time + 0.1
        duration = end_time - start_time
        if duration < min_duration:
            return
        peak_prob = float(probs[start_idx:end_idx].max())
        label = self.labels[class_idx] if class_idx < len(self.labels) else f"Class_{class_idx}"
        segments.append({
            "label": label,
            "display_label": label,
            "start_time": round(start_time, 3),
            "end_time": round(end_time, 3),
            "peak_prob": round(peak_prob, 4),
        })

    def detect_clip_tags(
        self,
        file_path: str,
        top_k: int = 10,
        threshold: float = 0.1,
    ) -> List[Dict]:
        """
        整段音频的标签分类（非时间轴，用于快速标签建议）
        Returns: List[{label, display_label, prob}]
        """
        waveform, duration = self._load_audio(file_path)

        # 取前 10s
        max_samples = int(self.clip_duration * self.sample_rate)
        if len(waveform) > max_samples:
            waveform = waveform[:max_samples]

        if not self._model_loaded and not self.load():
            raise RuntimeError("PANNs model not loaded")

        # 使用 panns-inference AudioTagging 或手动推理
        if PANNS_PACKAGE_AVAILABLE:
            try:
                at = AudioTagging(device=self.device)
                clipwise_output, _ = at.inference(audio_path=file_path)
                if isinstance(clipwise_output, torch.Tensor):
                    clipwise_output = clipwise_output.cpu().numpy()
                probs = clipwise_output[0]
            except Exception:
                probs = self._run_clip_inference(waveform)
        else:
            probs = self._run_clip_inference(waveform)

        # 取 top_k
        top_indices = np.argsort(probs)[::-1][:top_k]
        results = []
        for idx in top_indices:
            prob = float(probs[idx])
            if prob < threshold:
                continue
            label = self.labels[idx] if idx < len(self.labels) else f"Class_{idx}"
            results.append({
                "label": label,
                "display_label": label,
                "prob": round(prob, 4),
            })
        return results

    def _run_clip_inference(self, waveform: np.ndarray) -> np.ndarray:
        """手动运行 clip-level 推理"""
        x = self._preprocess(waveform)
        with torch.no_grad():
            output = self.model(x)
            if isinstance(output, dict):
                clipwise = output.get("clipwise_output", output.get("framewise_output"))
            elif isinstance(output, (tuple, list)):
                clipwise = output[0]
            else:
                clipwise = output
            if clipwise.dim() == 3:
                # framewise，做时间平均
                clipwise = clipwise.mean(dim=1)
            clipwise = torch.sigmoid(clipwise)
        return clipwise[0].cpu().numpy()


# 全局单例
_panns_engine: Optional[PannsEngine] = None


def get_panns_engine() -> PannsEngine:
    global _panns_engine
    if _panns_engine is None:
        _panns_engine = PannsEngine()
    return _panns_engine


def detect_sound_events(
    file_path: str,
    threshold: float = 0.3,
    min_duration: float = 0.25,
    max_segments: int = 20,
) -> List[Dict]:
    """便捷函数：检测音频事件时间段"""
    engine = get_panns_engine()
    return engine.detect_events(
        file_path=file_path,
        threshold=threshold,
        min_duration=min_duration,
        max_segments=max_segments,
    )


def detect_clip_tags(
    file_path: str,
    top_k: int = 10,
    threshold: float = 0.1,
) -> List[Dict]:
    """便捷函数：整段音频标签"""
    engine = get_panns_engine()
    return engine.detect_clip_tags(
        file_path=file_path,
        top_k=top_k,
        threshold=threshold,
    )
