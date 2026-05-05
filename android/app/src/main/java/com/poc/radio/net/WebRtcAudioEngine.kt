package com.poc.radio.net

import android.content.Context
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import org.webrtc.EglBase
import org.json.JSONObject

class WebRtcAudioEngine(
    context: Context,
    private val callback: Callback
) {
    interface Callback {
        fun onLocalIceCandidate(candidate: JSONObject)
        fun onRemoteAudioTrack()
        fun onError(message: String)
    }

    private val appContext = context.applicationContext
    private val eglBase = EglBase.create()
    private val pcFactory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null
    private var localAudioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )
        val adm = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()
        pcFactory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
    }

    fun ensurePeerConnection() {
        if (peerConnection != null) return
        val rtcConfig = PeerConnection.RTCConfiguration(
            listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        )
        peerConnection = pcFactory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
            override fun onIceCandidate(candidate: IceCandidate) {
                callback.onLocalIceCandidate(
                    JSONObject()
                        .put("sdpMid", candidate.sdpMid ?: "")
                        .put("sdpMLineIndex", candidate.sdpMLineIndex)
                        .put("candidate", candidate.sdp)
                )
            }
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit
            override fun onAddStream(stream: org.webrtc.MediaStream) = Unit
            override fun onRemoveStream(stream: org.webrtc.MediaStream) = Unit
            override fun onDataChannel(dc: org.webrtc.DataChannel) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<out org.webrtc.MediaStream>) {
                if (receiver.track() != null && receiver.track().kind() == "audio") {
                    callback.onRemoteAudioTrack()
                }
            }
        })

        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        localAudioSource = pcFactory.createAudioSource(audioConstraints)
        localAudioTrack = pcFactory.createAudioTrack("ARDAMSa0", localAudioSource)
        localAudioTrack?.setEnabled(false)
        peerConnection?.addTrack(localAudioTrack)
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun createOffer(onReady: (SessionDescription) -> Unit) {
        val pc = peerConnection ?: run {
            callback.onError("peer connection not ready")
            return
        }
        pc.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) return
                pc.setLocalDescription(NoopSdpObserver(), desc)
                onReady(desc)
            }
            override fun onSetSuccess() = Unit
            override fun onCreateFailure(err: String?) { callback.onError(err ?: "createOffer failed") }
            override fun onSetFailure(err: String?) { callback.onError(err ?: "setLocalDescription failed") }
        }, MediaConstraints())
    }

    fun createAnswer(onReady: (SessionDescription) -> Unit) {
        val pc = peerConnection ?: run {
            callback.onError("peer connection not ready")
            return
        }
        pc.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) return
                pc.setLocalDescription(NoopSdpObserver(), desc)
                onReady(desc)
            }
            override fun onSetSuccess() = Unit
            override fun onCreateFailure(err: String?) { callback.onError(err ?: "createAnswer failed") }
            override fun onSetFailure(err: String?) { callback.onError(err ?: "setLocalDescription failed") }
        }, MediaConstraints())
    }

    fun setRemoteDescription(type: String, sdp: String) {
        val pc = peerConnection ?: return
        val sdType = if (type.lowercase() == "answer") SessionDescription.Type.ANSWER else SessionDescription.Type.OFFER
        pc.setRemoteDescription(NoopSdpObserver(), SessionDescription(sdType, sdp))
    }

    fun addRemoteIce(candidate: JSONObject) {
        val pc = peerConnection ?: return
        val sdpMid = candidate.optString("sdpMid", "")
        val sdpMLineIndex = candidate.optInt("sdpMLineIndex", 0)
        val c = candidate.optString("candidate", "")
        if (c.isBlank()) return
        pc.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, c))
    }

    fun release() {
        runCatching { localAudioTrack?.dispose() }
        runCatching { localAudioSource?.dispose() }
        runCatching { peerConnection?.dispose() }
        localAudioTrack = null
        localAudioSource = null
        peerConnection = null
    }

    private class NoopSdpObserver : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription?) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(err: String?) = Unit
        override fun onSetFailure(err: String?) = Unit
    }
}

